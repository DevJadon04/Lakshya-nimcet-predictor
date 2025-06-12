// Load environment variables FIRST
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const twilio = require('twilio');

// Import Models
const User = require('./models/User');
const Prediction = require('./models/Prediction');

const app = express();
const PORT = process.env.PORT || 3000;

// 🎯 PREDICTION LIMIT CONFIGURATION
const PREDICTION_CONFIG = {
    LIMIT_PER_PHONE: 3,
    ADMIN_UNLIMITED: true,
    ADMIN_PHONES: ['9826577904'], 
    PREMIUM_USERS: [],
    RESET_DAILY: false
};


// Helper function to check if user has unlimited access (ENHANCED)
function hasUnlimitedAccess(phoneNumber) {
    console.log(`🔍 Checking unlimited access for: ${phoneNumber}`);
    console.log(`📋 Config ADMIN_UNLIMITED: ${PREDICTION_CONFIG.ADMIN_UNLIMITED}`);
    console.log(`📋 Target admin phone: 9826577904`);
    console.log(`🔍 Phone match check: "${phoneNumber}" === "9826577904" = ${phoneNumber === '9826577904'}`);
    
    const isAdmin = PREDICTION_CONFIG.ADMIN_UNLIMITED && (phoneNumber === '9826577904');
    const isPremium = PREDICTION_CONFIG.PREMIUM_USERS.includes(phoneNumber);
    
    console.log(`✅ Final result - Admin: ${isAdmin}, Premium: ${isPremium}, Overall: ${isAdmin || isPremium}`);
    
    return isAdmin || isPremium;
}
// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nimcet-predictor', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => {
    console.log('✅ Connected to MongoDB');
})
.catch((error) => {
    console.error('❌ MongoDB connection error:', error.message);
    console.log('📝 Make sure MongoDB is running locally or check your MONGODB_URI');
});

// Twilio Configuration
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN 
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const SMS_ENABLED = process.env.SMS_ENABLED === 'true' && twilioClient;

console.log('🔧 Configuration Status:');
console.log('- MongoDB:', mongoose.connection.readyState === 1 ? '✅ Connected' : '⏳ Connecting...');
console.log('- Twilio SMS:', SMS_ENABLED ? '✅ Enabled' : '❌ Disabled');

// Install axios if not already installed
const axios = require('axios');

// SMS Cost Tracking (Fixed)
let smsStats = {
    msg91: { count: 0, cost: 0 },
    twilio: { count: 0, cost: 0 },
    total: { count: 0, cost: 0 }
};

const trackSMSCost = (provider, success) => {
    if (success) {
        smsStats.total.count++;
        
        if (provider === 'MSG91') {
            smsStats.msg91.count++;
            smsStats.msg91.cost += 0.20;
            smsStats.total.cost += 0.20;
        } else if (provider === 'Twilio') {
            smsStats.twilio.count++;
            smsStats.twilio.cost += 7.11;
            smsStats.total.cost += 7.11;
        }
        
        console.log(`💰 SMS STATS: Total: ${smsStats.total.count} SMS, Cost: ₹${smsStats.total.cost.toFixed(2)}`);
    }
};
// ✅ ALTERNATIVE: MSG91 Send HTTP API (No template needed)
const sendSMS_MSG91_HTTP = async (phoneNumber, otp) => {
    try {
        console.log(`📱 MSG91 HTTP API - Phone: ${phoneNumber}, OTP: ${otp}`);
        
        const message = `Your NIMCET Rank Predictor OTP is ${otp}. Valid for 10 minutes. Do not share with anyone.`;
        
        const response = await axios.get('https://api.msg91.com/api/sendhttp.php', {
            params: {
                authkey: process.env.MSG91_AUTH_KEY,
                mobiles: phoneNumber,
                message: message,
                sender: 'VERIFY', // or your approved sender ID
                route: '4', // Transactional route
                country: '91'
            },
            timeout: 10000
        });

        console.log(`📋 MSG91 HTTP Response:`, response.data);
        
        // Check if message was sent successfully
        if (response.status === 200 && response.data) {
            // MSG91 HTTP API returns different response formats
            const responseText = response.data.toString();
            
            if (responseText.includes('success') || !responseText.includes('error')) {
                console.log(`✅ MSG91 HTTP Success - Cost: ₹0.20`);
                return { 
                    success: true, 
                    provider: 'MSG91-HTTP', 
                    cost: '₹0.20',
                    method: 'msg91-http',
                    response: response.data
                };
            }
        }
        
        console.log(`❌ MSG91 HTTP Error:`, response.data);
        return { 
            success: false, 
            error: response.data 
        };
        
    } catch (error) {
        console.error(`❌ MSG91 HTTP Error:`, {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
        });
        
        return { 
            success: false, 
            error: error.response?.data || error.message 
        };
    }
};

// // MSG91 SMS Function
// const sendSMS_MSG91 = async (phoneNumber, otp) => {
//     try {
//         console.log(`📱 Trying MSG91 SMS to ${phoneNumber}`);
        
//         const response = await axios.post('https://control.msg91.com/api/v5/otp', {
//             template_id: process.env.MSG91_TEMPLATE_ID || '684a0a9dd6fc05236e045592',
//             mobile: `91${phoneNumber}`,
//             authkey: process.env.MSG91_AUTH_KEY,
//             otp: otp,
//             otp_expiry: 10
//         }, {
//             headers: { 'Content-Type': 'application/json' }
//         });

//         console.log(`✅ MSG91 Success - Cost: ₹0.20`);
//         trackSMSCost('MSG91', true); // ✅ Correct placement
        
//         return { 
//             success: true, 
//             provider: 'MSG91', 
//             cost: '₹0.20',
//             method: 'msg91'
//         };
        
//     } catch (error) {
//         console.error(`❌ MSG91 failed:`, error.response?.data || error.message);
//         return { 
//             success: false, 
//             provider: 'MSG91', 
//             error: error.message 
//         };
//     }
// };

// Twilio SMS Function (Backup)
const sendSMS_Twilio = async (phoneNumber, message) => {
    try {
        if (!SMS_ENABLED || !twilioClient) {
            console.log(`📱 Twilio DISABLED - Console OTP for ${phoneNumber}`);
            return { success: true, method: 'console', provider: 'Console' };
        }

        const result = await twilioClient.messages.create({
            body: message,
            from: TWILIO_PHONE_NUMBER,
            to: `+91${phoneNumber}`
        });

        console.log(`✅ Twilio Success - Cost: ₹7.11 - SID: ${result.sid}`);
        trackSMSCost('Twilio', true); // ✅ Correct placement
        
        return { 
            success: true, 
            provider: 'Twilio', 
            cost: '₹7.11',
            sid: result.sid, 
            method: 'twilio' 
        };
        
    } catch (error) {
        console.error(`❌ Twilio failed:`, error.message);
        return { 
            success: false, 
            provider: 'Twilio', 
            error: error.message 
        };
    }
};

// Enhanced SMS Function (Fixed)
const sendSMS = async (phoneNumber, message) => {
    try {
        // Extract OTP from message
        const otp = message.match(/\d{6}/)?.[0];
        if (!otp) {
            console.error('❌ Could not extract OTP from message');
            return { success: false, error: 'Invalid OTP format' };
        }

        console.log(`🚀 Sending SMS to ${phoneNumber} - OTP: ${otp}`);
        
        // Try MSG91 first (cheap)
        if (process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID) {
            console.log(`💰 Trying MSG91 first (₹0.20)`);
            const msg91Result = await sendSMS_MSG91_HTTP(phoneNumber, otp);
            
            if (msg91Result.success) {
                console.log(`🎉 MSG91 SUCCESS - Saved ₹6.91!`);
                return msg91Result;
            }
            
            console.log(`⚠️ MSG91 failed, trying Twilio...`);
        }

        // Fallback to Twilio (expensive)
        console.log(`💸 Using Twilio backup (₹7.11)`);
        const twilioResult = await sendSMS_Twilio(phoneNumber, message);
        
        if (twilioResult.success) {
            console.log(`✅ Twilio SUCCESS (backup)`);
            return twilioResult;
        }

        // All failed
        console.error(`❌ ALL SMS PROVIDERS FAILED`);
        console.log(`📱 CONSOLE FALLBACK - OTP: ${otp}`);
        
        return { 
            success: false, 
            error: 'All SMS providers failed',
            fallback: `OTP: ${otp}`,
            method: 'console'
        };
        
    } catch (error) {
        console.error('❌ SMS Error:', error);
        return { success: false, error: error.message };
    }
};
// Helper functions
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));


// NIMCET Colleges Data - 13 Colleges with Real Seats & Fees
const nimcetColleges = [
    // 1. NIT Trichy - Under 100 Rank
    {
        name: "NIT Trichy (National Institute of Technology, Tiruchirappalli)",
        location: "Tiruchirappalli, Tamil Nadu",
        type: "NIT",
        tier: 1,
        cutoffs: {
            General: { min: 1, max: 100 },
            EWS: { min: 1, max: 120 },
            OBC: { min: 1, max: 150 },
            SC: { min: 1, max: 200 },
            ST: { min: 1, max: 250 },
            PWD: { min: 1, max: 180 }
        },
        fees: "₹2.10 Lakhs (Total Program)",
        duration: "3 Years",
        seats: 115, // From seat matrix document
        highlights: ["Top NIT for MCA", "Excellent Placement Record", "Industry Partnerships"]
    },

    // 2. NIT Delhi - Under 120 Rank
    {
        name: "NIT Delhi (National Institute of Technology Delhi)",
        location: "New Delhi, Delhi",
        type: "NIT",
        tier: 1,
        cutoffs: {
            General: { min: 1, max: 120 },
            EWS: { min: 1, max: 145 },
            OBC: { min: 1, max: 180 },
            SC: { min: 1, max: 240 },
            ST: { min: 1, max: 300 },
            PWD: { min: 1, max: 220 }
        },
        fees: "₹2.10 Lakhs (Total Program)",
        duration: "3 Years",
        seats: 10, // From seat matrix document
        highlights: ["Capital Location", "Top Industry Exposure", "Metro Connectivity"]
    },

    // 3. NIT Warangal - Under 200 Rank
    {
        name: "NIT Warangal (National Institute of Technology, Warangal)",
        location: "Warangal, Telangana",
        type: "NIT",
        tier: 1,
        cutoffs: {
            General: { min: 1, max: 200 },
            EWS: { min: 1, max: 240 },
            OBC: { min: 1, max: 300 },
            SC: { min: 1, max: 400 },
            ST: { min: 1, max: 500 },
            PWD: { min: 1, max: 360 }
        },
        fees: "₹2.10 Lakhs (Total Program)",
        duration: "3 Years",
        seats: 58, // From seat matrix document
        highlights: ["Research Excellence", "Strong Alumni Network", "Tech Giants Recruitment"]
    },

    // 4. NIT Allahabad - Under 250 Rank
    {
        name: "NIT Allahabad (Motilal Nehru National Institute of Technology)",
        location: "Prayagraj, Uttar Pradesh",
        type: "NIT",
        tier: 1,
        cutoffs: {
            General: { min: 120, max: 250 },
            EWS: { min: 150, max: 300 },
            OBC: { min: 180, max: 375 },
            SC: { min: 240, max: 500 },
            ST: { min: 300, max: 625 },
            PWD: { min: 200, max: 450 }
        },
        fees: "₹2.10 Lakhs (Total Program)",
        duration: "3 Years",
        seats: 116, // From seat matrix document
        highlights: ["Historic Institution", "Strong Faculty", "Good Placement Support"]
    },

    // 5. NIT Bhopal - Under 350 Rank
    {
        name: "NIT Bhopal (Maulana Azad National Institute of Technology)",
        location: "Bhopal, Madhya Pradesh",
        type: "NIT",
        tier: 2,
        cutoffs: {
            General: { min: 200, max: 350 },
            EWS: { min: 240, max: 420 },
            OBC: { min: 300, max: 525 },
            SC: { min: 400, max: 700 },
            ST: { min: 500, max: 875 },
            PWD: { min: 350, max: 630 }
        },
        fees: "₹2.77 Lakhs (Total Program)",
        duration: "3 Years",
        seats: 115, // From seat matrix document
        highlights: ["Central Location", "Growing Reputation", "Affordable Fees"]
    },

    // 6. NIT Kurukshetra - Under 400 Rank
    {
        name: "NIT Kurukshetra (National Institute of Technology Kurukshetra)",
        location: "Kurukshetra, Haryana",
        type: "NIT",
        tier: 2,
        cutoffs: {
            General: { min: 250, max: 400 },
            EWS: { min: 300, max: 480 },
            OBC: { min: 375, max: 600 },
            SC: { min: 500, max: 800 },
            ST: { min: 625, max: 1000 },
            PWD: { min: 450, max: 720 }
        },
        fees: "₹2.10 Lakhs (Total Program)",
        duration: "3 Years",
        seats: 64, // From seat matrix document
        highlights: ["NCR Proximity", "Good Connectivity", "Emerging Programs"]
    },

    // 7. NIT Patna - Under 450 Rank
    {
        name: "NIT Patna (National Institute of Technology Patna) - Data Sciences & Informatics",
        location: "Patna, Bihar",
        type: "NIT",
        tier: 2,
        cutoffs: {
            General: { min: 300, max: 450 },
            EWS: { min: 360, max: 540 },
            OBC: { min: 450, max: 675 },
            SC: { min: 600, max: 900 },
            ST: { min: 750, max: 1125 },
            PWD: { min: 540, max: 810 }
        },
        fees: "₹3.00 Lakhs (Total Program)",
        duration: "3 Years",
        seats: 40, // From seat matrix document
        highlights: ["Data Sciences Focus", "Growing Placement", "Specialized Program"]
    },

    // 8. NIT Jamshedpur - Under 550 Rank
    {
        name: "NIT Jamshedpur (National Institute of Technology Jamshedpur)",
        location: "Jamshedpur, Jharkhand",
        type: "NIT",
        tier: 2,
        cutoffs: {
            General: { min: 350, max: 550 },
            EWS: { min: 420, max: 660 },
            OBC: { min: 525, max: 825 },
            SC: { min: 700, max: 1100 },
            ST: { min: 875, max: 1375 },
            PWD: { min: 630, max: 990 }
        },
        fees: "₹2.10 Lakhs (Total Program)",
        duration: "3 Years",
        seats: 115, // From seat matrix document
        highlights: ["Steel City", "Industrial Exposure", "Hands-on Learning"]
    },

    // 9. NIT Raipur - Under 650 Rank
    {
        name: "NIT Raipur (National Institute of Technology Raipur)",
        location: "Raipur, Chhattisgarh",
        type: "NIT",
        tier: 2,
        cutoffs: {
            General: { min: 450, max: 650 },
            EWS: { min: 540, max: 780 },
            OBC: { min: 675, max: 975 },
            SC: { min: 900, max: 1300 },
            ST: { min: 1125, max: 1625 },
            PWD: { min: 810, max: 1170 }
        },
        fees: "₹2.10 Lakhs (Total Program)",
        duration: "3 Years",
        seats: 110, // From seat matrix document
        highlights: ["Emerging NIT", "Good Infrastructure", "Industry Connect"]
    },

    // 10. NIT Meghalaya - Under 800 Rank
    {
        name: "NIT Meghalaya (National Institute of Technology Meghalaya)",
        location: "Shillong, Meghalaya",
        type: "NIT",
        tier: 3,
        cutoffs: {
            General: { min: 550, max: 800 },
            EWS: { min: 660, max: 960 },
            OBC: { min: 825, max: 1200 },
            SC: { min: 1100, max: 1600 },
            ST: { min: 1375, max: 2000 },
            PWD: { min: 990, max: 1440 }
        },
        fees: "₹2.10 Lakhs (Total Program)",
        duration: "3 Years",
        seats: 20, // From seat matrix document
        highlights: ["Northeast Hub", "Scenic Location", "Lower Competition"]
    },

    // 11. NIT Agartala - Under 850 Rank
    {
        name: "NIT Agartala (National Institute of Technology Agartala)",
        location: "Agartala, Tripura",
        type: "NIT",
        tier: 3,
        cutoffs: {
            General: { min: 650, max: 850 },
            EWS: { min: 780, max: 1020 },
            OBC: { min: 975, max: 1275 },
            SC: { min: 1300, max: 1700 },
            ST: { min: 1625, max: 2125 },
            PWD: { min: 1170, max: 1530 }
        },
        fees: "₹2.54 Lakhs (Total Program)",
        duration: "3 Years",
        seats: 60, // From seat matrix document
        highlights: ["Border State", "Cultural Diversity", "Emerging Institute"]
    },

    // 12. IIIT Bhopal - Under 1100 Rank
    {
        name: "IIIT Bhopal (Indian Institute of Information Technology Bhopal)",
        location: "Bhopal, Madhya Pradesh",
        type: "IIIT",
        tier: 2,
        cutoffs: {
            General: { min: 700, max: 1100 },
            EWS: { min: 840, max: 1320 },
            OBC: { min: 1050, max: 1650 },
            SC: { min: 1400, max: 2200 },
            ST: { min: 1750, max: 2750 },
            PWD: { min: 1260, max: 1980 }
        },
        fees: "₹6.93 Lakhs (Total Program)",
        duration: "3 Years",
        seats: 75, // From seat matrix document
        highlights: ["IT Focused", "Modern Curriculum", "Industry Partnerships"]
    },

    // 13. IIIT Vadodara - Under 1300 Rank
    {
        name: "IIIT Vadodara (Indian Institute of Information Technology Vadodara)",
        location: "Vadodara, Gujarat",
        type: "IIIT",
        tier: 2,
        cutoffs: {
            General: { min: 900, max: 1300 },
            EWS: { min: 1080, max: 1560 },
            OBC: { min: 1350, max: 1950 },
            SC: { min: 1800, max: 2600 },
            ST: { min: 2250, max: 3250 },
            PWD: { min: 1620, max: 2340 }
        },
        fees: "₹7.50 Lakhs (Total Program)",
        duration: "3 Years",
        seats: 120, // From seat matrix document (Gandhinagar Campus)
        highlights: ["Gujarat Location", "Technology Focus", "Growing Reputation"]
    }
];


// NIMCET rank prediction data (CORRECTED VERSION)
const nimcetRankData = [
    // General Category
    { minMarks: 500, maxMarks: 1000, minRank: 1, maxRank: 10, category: 'General' },
    { minMarks: 450, maxMarks: 499, minRank: 11, maxRank: 50, category: 'General' },
    { minMarks: 350, maxMarks: 449, minRank: 51, maxRank: 150, category: 'General' },
    { minMarks: 300, maxMarks: 349, minRank: 151, maxRank: 300, category: 'General' },
    { minMarks: 270, maxMarks: 299, minRank: 301, maxRank: 500, category: 'General' },
    { minMarks: 250, maxMarks: 269, minRank: 501, maxRank: 800, category: 'General' },
    { minMarks: 230, maxMarks: 249, minRank: 801, maxRank: 1200, category: 'General' },
    { minMarks: 200, maxMarks: 229, minRank: 1201, maxRank: 1800, category: 'General' },
    { minMarks: 180, maxMarks: 199, minRank: 1801, maxRank: 2500, category: 'General' },
    { minMarks: 150, maxMarks: 179, minRank: 2501, maxRank: 3500, category: 'General' },
    { minMarks: 120, maxMarks: 149, minRank: 3501, maxRank: 5000, category: 'General' },
    { minMarks: 100, maxMarks: 119, minRank: 5001, maxRank: 7000, category: 'General' },
  
    // OBC Category
    { minMarks: 450, maxMarks: 1000, minRank: 1, maxRank: 10, category: 'OBC' },
    { minMarks: 400, maxMarks: 449, minRank: 11, maxRank: 50, category: 'OBC' },
    { minMarks: 320, maxMarks: 399, minRank: 51, maxRank: 150, category: 'OBC' },
    { minMarks: 280, maxMarks: 319, minRank: 151, maxRank: 300, category: 'OBC' },
    { minMarks: 250, maxMarks: 279, minRank: 301, maxRank: 500, category: 'OBC' },
    { minMarks: 220, maxMarks: 249, minRank: 501, maxRank: 800, category: 'OBC' },
    { minMarks: 200, maxMarks: 219, minRank: 801, maxRank: 1200, category: 'OBC' },
    { minMarks: 190, maxMarks: 199, minRank: 1201, maxRank: 1800, category: 'OBC' },
    { minMarks: 170, maxMarks: 189, minRank: 1801, maxRank: 2500, category: 'OBC' },
    { minMarks: 140, maxMarks: 169, minRank: 2501, maxRank: 3500, category: 'OBC' },
    { minMarks: 110, maxMarks: 139, minRank: 3501, maxRank: 5000, category: 'OBC' },
    { minMarks: 90, maxMarks: 109, minRank: 5001, maxRank: 7000, category: 'OBC' },

    // EWS Category
    { minMarks: 450, maxMarks: 1000, minRank: 1, maxRank: 10, category: 'EWS' },
    { minMarks: 400, maxMarks: 449, minRank: 11, maxRank: 50, category: 'EWS' },
    { minMarks: 320, maxMarks: 399, minRank: 51, maxRank: 150, category: 'EWS' },
    { minMarks: 280, maxMarks: 319, minRank: 151, maxRank: 300, category: 'EWS' },
    { minMarks: 250, maxMarks: 279, minRank: 301, maxRank: 500, category: 'EWS' },
    { minMarks: 220, maxMarks: 249, minRank: 501, maxRank: 800, category: 'EWS' },
    { minMarks: 200, maxMarks: 219, minRank: 801, maxRank: 1200, category: 'EWS' },
    { minMarks: 190, maxMarks: 199, minRank: 1201, maxRank: 1800, category: 'EWS' },
    { minMarks: 170, maxMarks: 189, minRank: 1801, maxRank: 2500, category: 'EWS' },
    { minMarks: 140, maxMarks: 169, minRank: 2501, maxRank: 3500, category: 'EWS' },
    { minMarks: 110, maxMarks: 139, minRank: 3501, maxRank: 5000, category: 'EWS' },
    { minMarks: 90, maxMarks: 109, minRank: 5001, maxRank: 7000, category: 'EWS' },

    // SC Category
    { minMarks: 250, maxMarks: 1000, minRank: 1, maxRank: 10, category: 'SC' },
    { minMarks: 200, maxMarks: 249, minRank: 11, maxRank: 50, category: 'SC' },
    { minMarks: 185, maxMarks: 199, minRank: 51, maxRank: 150, category: 'SC' },
    { minMarks: 170, maxMarks: 184, minRank: 151, maxRank: 300, category: 'SC' },
    { minMarks: 150, maxMarks: 169, minRank: 301, maxRank: 500, category: 'SC' },
    { minMarks: 120, maxMarks: 149, minRank: 501, maxRank: 800, category: 'SC' },
    { minMarks: 100, maxMarks: 119, minRank: 801, maxRank: 1200, category: 'SC' },
    { minMarks: 90, maxMarks: 99, minRank: 1201, maxRank: 1800, category: 'SC' },
    { minMarks: 70, maxMarks: 89, minRank: 1801, maxRank: 2500, category: 'SC' },
    { minMarks: 40, maxMarks: 69, minRank: 2501, maxRank: 3500, category: 'SC' },
    { minMarks: 30, maxMarks: 39, minRank: 3501, maxRank: 5000, category: 'SC' },
    { minMarks: 20, maxMarks: 29, minRank: 5001, maxRank: 7000, category: 'SC' },

    // ST Category
    { minMarks: 230, maxMarks: 1000, minRank: 1, maxRank: 10, category: 'ST' },
    { minMarks: 190, maxMarks: 229, minRank: 11, maxRank: 50, category: 'ST' },
    { minMarks: 150, maxMarks: 189, minRank: 51, maxRank: 150, category: 'ST' },
    { minMarks: 140, maxMarks: 149, minRank: 151, maxRank: 300, category: 'ST' },
    { minMarks: 130, maxMarks: 139, minRank: 301, maxRank: 500, category: 'ST' },
    { minMarks: 120, maxMarks: 129, minRank: 501, maxRank: 800, category: 'ST' },
    { minMarks: 100, maxMarks: 119, minRank: 801, maxRank: 1200, category: 'ST' },
    { minMarks: 90, maxMarks: 99, minRank: 1201, maxRank: 1800, category: 'ST' },
    { minMarks: 70, maxMarks: 89, minRank: 1801, maxRank: 2500, category: 'ST' },
    { minMarks: 40, maxMarks: 69, minRank: 2501, maxRank: 3500, category: 'ST' },
    { minMarks: 30, maxMarks: 39, minRank: 3501, maxRank: 5000, category: 'ST' },
    { minMarks: 20, maxMarks: 29, minRank: 5001, maxRank: 7000, category: 'ST' },

    // PWD Category - FIXED TECHNICAL ERRORS
    { minMarks: 370, maxMarks: 819, minRank: 1, maxRank: 10, category: 'PWD' },
    { minMarks: 350, maxMarks: 369, minRank: 11, maxRank: 50, category: 'PWD' },
    { minMarks: 320, maxMarks: 349, minRank: 51, maxRank: 100, category: 'PWD' },
    { minMarks: 300, maxMarks: 319, minRank: 101, maxRank: 150, category: 'PWD' },
    { minMarks: 280, maxMarks: 299, minRank: 151, maxRank: 200, category: 'PWD' },
    { minMarks: 260, maxMarks: 279, minRank: 201, maxRank: 250, category: 'PWD' },
    { minMarks: 240, maxMarks: 259, minRank: 251, maxRank: 300, category: 'PWD' },
    { minMarks: 220, maxMarks: 239, minRank: 301, maxRank: 350, category: 'PWD' },
    { minMarks: 200, maxMarks: 219, minRank: 351, maxRank: 400, category: 'PWD' },
    { minMarks: 180, maxMarks: 199, minRank: 401, maxRank: 450, category: 'PWD' },
    { minMarks: 160, maxMarks: 179, minRank: 451, maxRank: 500, category: 'PWD' },
    { minMarks: 140, maxMarks: 159, minRank: 501, maxRank: 550, category: 'PWD' },
    { minMarks: 120, maxMarks: 139, minRank: 551, maxRank: 600, category: 'PWD' },
    { minMarks: 100, maxMarks: 119, minRank: 601, maxRank: 650, category: 'PWD' },
    { minMarks: 80, maxMarks: 99, minRank: 651, maxRank: 700, category: 'PWD' },
    { minMarks: 60, maxMarks: 79, minRank: 701, maxRank: 20000, category: 'PWD' }
];

// Function to get eligible colleges based on rank and category (UPDATED - 80% minimum chance)
const getEligibleColleges = (minRank, maxRank, category) => {
    const eligibleColleges = [];
    
    nimcetColleges.forEach(college => {
        const cutoff = college.cutoffs[category];
        if (cutoff) {
            // Check if user's rank range overlaps with college cutoff
            if (minRank <= cutoff.max && maxRank >= cutoff.min) {
                const chance = calculateChance(minRank, maxRank, cutoff.min, cutoff.max);
                
                // 🎯 ONLY SHOW COLLEGES WITH 80% OR HIGHER CHANCE
                if (chance >= 80) {
                    eligibleColleges.push({
                        ...college,
                        chance,
                        cutoffRange: `${cutoff.min} - ${cutoff.max}`,
                        userRank: `${minRank} - ${maxRank}`,
                        chanceText: `${chance}% chance of admission`
                    });
                }
            }
        }
    });
    
    // Sort by chance (High to Low) and then by tier
    return eligibleColleges.sort((a, b) => {
        if (b.chance !== a.chance) return b.chance - a.chance;
        return a.tier - b.tier;
    });
};

// Function to calculate admission chances
const calculateChance = (userMinRank, userMaxRank, collegeMinRank, collegeMaxRank) => {
    // If user's best rank is better than college's worst cutoff - High chance
    if (userMinRank <= collegeMaxRank * 0.5) return 90;
    
    // If user's best rank is within college range - Good chance
    if (userMinRank <= collegeMaxRank) return 75;
    
    // If user's worst rank is within college range - Moderate chance
    if (userMaxRank <= collegeMaxRank) return 60;
    
    // If there's any overlap - Low chance
    if (userMinRank <= collegeMaxRank && userMaxRank >= collegeMinRank) return 40;
    
    // No chance
    return 0;
};

// Routes
// NEW: Check Prediction Limit Before OTP Request
app.post('/api/check-limit', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        
        if (!phoneNumber || phoneNumber.length !== 10) {
            return res.status(400).json({ success: false, message: 'Valid phone number required' });
        }
        
        const user = await User.findOne({ phoneNumber });
        
        if (!user) {
            return res.json({
                success: true,
                canRequestOtp: true,
                message: 'New user - can request OTP',
                predictionsUsed: 0,
                predictionsRemaining: PREDICTION_CONFIG.LIMIT_PER_PHONE
            });
        }
        
        if (hasUnlimitedAccess(phoneNumber)) {
            return res.json({
                success: true,
                canRequestOtp: true,
                message: 'Admin/Premium user - unlimited access',
                predictionsUsed: 'N/A',
                predictionsRemaining: 'Unlimited'
            });
        }
        
        const predictions = await Prediction.countDocuments({ userId: user._id });
        const canRequest = predictions < PREDICTION_CONFIG.LIMIT_PER_PHONE;
        
        res.json({
            success: true,
            canRequestOtp: canRequest,
            message: canRequest ? 'Can request OTP' : 'Prediction limit reached',
            predictionsUsed: predictions,
            predictionsRemaining: Math.max(0, PREDICTION_CONFIG.LIMIT_PER_PHONE - predictions),
            phoneNumber: phoneNumber
        });
        
    } catch (error) {
        console.error('Check Limit Error:', error);
        res.status(500).json({ success: false, error: 'Failed to check limit' });
    }
});
// ENHANCED: Send OTP Route with Prediction Limit Check
app.post('/api/send-otp', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        
        // Validate phone number
        if (!phoneNumber || phoneNumber.length !== 10) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please enter a valid 10-digit phone number' 
            });
        }
        
        if (!/^[6-9]\d{9}$/.test(phoneNumber)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please enter a valid Indian mobile number' 
            });
        }
        
        // 🚨 NEW: Check if user has reached prediction limit BEFORE sending OTP
        const existingUser = await User.findOne({ phoneNumber });
        
        if (existingUser && !hasUnlimitedAccess(phoneNumber)) {
            const existingPredictions = await Prediction.countDocuments({ userId: existingUser._id });
            const PREDICTION_LIMIT = PREDICTION_CONFIG.LIMIT_PER_PHONE;
            
            console.log(`🔍 OTP Request Check - Phone: ${phoneNumber}, Predictions: ${existingPredictions}/${PREDICTION_LIMIT}`);
            
            if (existingPredictions >= PREDICTION_LIMIT) {
                console.log(`🚫 BLOCKING OTP REQUEST - Limit reached for ${phoneNumber}`);
                
                return res.status(429).json({
                    success: false,
                    message: `This number has reached the prediction limit (${PREDICTION_LIMIT}/${PREDICTION_LIMIT} used).`,
                    errorType: 'LIMIT_REACHED_NO_OTP',
                    details: {
                        predictionsUsed: existingPredictions,
                        predictionsAllowed: PREDICTION_LIMIT,
                        phoneNumber: phoneNumber,
                        suggestions: [
                            'Use a different phone number to get predictions',
                            'Contact admin to reset your limit',
                            'Each phone number gets 3 free predictions'
                        ]
                    },
                    blockReason: 'PREDICTION_LIMIT_REACHED',
                    canRequestOtp: false
                });
            }
        }
        
        console.log(`✅ OTP REQUEST ALLOWED for ${phoneNumber} - Predictions: ${existingUser ? await Prediction.countDocuments({ userId: existingUser._id }) : 0}/${PREDICTION_CONFIG.LIMIT_PER_PHONE}`);
        
        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        
        // Find or create user
        let user = existingUser;
        
        if (user) {
            // Update existing user
            user.otp = otp;
            user.otpExpiry = otpExpiry;
            user.isVerified = false;
            await user.save();
        } else {
            // Create new user (without full name for now)
            user = new User({
                phoneNumber,
                otp,
                otpExpiry,
                isVerified: false,
                fullName: 'Pending' // Will be updated during verification
            });
            await user.save();
        }
        
        // Send SMS
        const smsMessage = `Your NIMCET Rank Predictor OTP is: ${otp}. Valid for 10 minutes. Do not share with anyone.`;
        const smsResult = await sendSMS(phoneNumber, smsMessage);
        
        console.log(`📱 OTP SENT to ${phoneNumber} - Method: ${smsResult.method}`);
        
        res.json({
            success: true,
            message: smsResult.method === 'twilio' 
                ? 'OTP sent to your mobile number' 
                : 'OTP generated successfully',
            requiresName: !user.fullName || user.fullName === 'Pending',
            expiresIn: '10 minutes',
            remainingPredictions: hasUnlimitedAccess(phoneNumber) ? 'Unlimited' : Math.max(0, PREDICTION_CONFIG.LIMIT_PER_PHONE - (existingUser ? await Prediction.countDocuments({ userId: existingUser._id }) : 0))
        });
        
    } catch (error) {
        console.error('Send OTP Error:', error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send OTP. Please try again.'
        });
    }
});

// Verify OTP Route (Updated with Full Name)
app.post('/api/verify-otp', async (req, res) => {
    try {
        const { phoneNumber, otp, fullName } = req.body;
        
        // Validate input
        if (!phoneNumber || !otp) {
            return res.status(400).json({ 
                success: false, 
                message: 'Phone number and OTP are required' 
            });
        }
        
        // Find user
        const user = await User.findOne({ phoneNumber });
        
        if (!user) {
            return res.status(400).json({ 
                success: false, 
                message: 'Phone number not found. Please request OTP first.' 
            });
        }
        
        // Check OTP
        if (user.otp !== otp) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid OTP. Please check and try again.' 
            });
        }
        
        // Check expiry
        if (new Date() > user.otpExpiry) {
            return res.status(400).json({ 
                success: false, 
                message: 'OTP expired. Please request a new one.' 
            });
        }
        
        // Validate full name if provided
        if (fullName) {
            if (fullName.trim().length < 2) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Please enter your full name (minimum 2 characters)' 
                });
            }
            user.fullName = fullName.trim();
        }
        
        // Check if name is required but not provided
        if (!user.fullName || user.fullName === 'Pending') {
            if (!fullName) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Full name is required',
                    requiresName: true
                });
            }
        }
        
        // Mark as verified
        user.isVerified = true;
        user.sessionToken = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        user.verifiedAt = new Date();
        user.lastLoginAt = new Date();
        user.otp = undefined; // Clear OTP for security
        user.otpExpiry = undefined;
        
        await user.save();
        
        res.json({
            success: true,
            message: `Welcome ${user.fullName}! Phone verified successfully.`,
            token: user.sessionToken,
            userId: user._id,
            user: {
                fullName: user.fullName,
                phoneNumber: user.phoneNumber,
                memberSince: user.createdAt
            }
        });
        
    } catch (error) {
        console.error('Verify OTP Error:', error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to verify OTP. Please try again.'
        });
    }
});

// Predict Rank Route (Updated for MongoDB)
// Predict Rank Route (Updated with Prediction Limits)
// UPDATED: Predict Rank Route with Debug Logging and Admin Fix
app.post('/api/predict-rank', async (req, res) => {
    try {
        const { marks, category, token } = req.body;
        
        // Validate input
        if (!marks || !category || !token) {
            return res.status(400).json({ 
                success: false, 
                message: 'Marks, category, and token are required' 
            });
        }
        
        if (marks < 0 || marks > 1000) {
            return res.status(400).json({ 
                success: false, 
                message: 'Marks must be between 0 and 1000' 
            });
        }
        
        // Verify user
        const user = await User.findOne({ sessionToken: token, isVerified: true });
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Unauthorized or session expired. Please login again.' 
            });
        }
        
        // 🔍 DEBUG: Admin Status Check
        console.log('\n' + '='.repeat(60));
        console.log('🔍 PREDICTION REQUEST DEBUG INFO');
        console.log('='.repeat(60));
        console.log(`📱 Phone Number: ${user.phoneNumber}`);
        console.log(`👤 Full Name: ${user.fullName}`);
        console.log(`🎯 Requested Marks: ${marks}`);
        console.log(`📚 Category: ${category}`);
        console.log(`🔑 Admin Phone Config: 9826577904`);
        console.log(`🔄 Admin Unlimited Enabled: ${PREDICTION_CONFIG.ADMIN_UNLIMITED}`);
        
        // Check if user has unlimited access
        const hasUnlimited = hasUnlimitedAccess(user.phoneNumber);
        console.log(`✅ Has Unlimited Access: ${hasUnlimited}`);
        console.log(`🎭 Is Admin Phone Match: ${user.phoneNumber === '9826577904'}`);
        
        // Get prediction counts
        const PREDICTION_LIMIT = PREDICTION_CONFIG.LIMIT_PER_PHONE;
        const existingPredictions = await Prediction.countDocuments({ userId: user._id });
        
        console.log(`📊 Existing Predictions: ${existingPredictions}`);
        console.log(`📋 Prediction Limit: ${PREDICTION_LIMIT}`);
        console.log(`🔢 Limit Check: ${existingPredictions} >= ${PREDICTION_LIMIT} = ${existingPredictions >= PREDICTION_LIMIT}`);
        console.log(`🚫 Will Block?: ${!hasUnlimited && existingPredictions >= PREDICTION_LIMIT}`);
        
        // 🚨 CHECK PREDICTION LIMIT WITH ENHANCED LOGGING
        if (!hasUnlimited && existingPredictions >= PREDICTION_LIMIT) {
            console.log(`❌ BLOCKING PREDICTION - Limit reached for ${user.phoneNumber}`);
            console.log(`📱 User: ${user.fullName} (${user.phoneNumber})`);
            console.log(`🔢 Used: ${existingPredictions}/${PREDICTION_LIMIT}`);
            console.log('='.repeat(60));
            
            return res.status(429).json({ // 429 = Too Many Requests
                success: false, 
                message: `Prediction limit reached! You have used all ${PREDICTION_LIMIT} predictions for this number.`,
                errorType: 'LIMIT_REACHED',
                details: {
                    predictionsUsed: existingPredictions,
                    predictionsAllowed: PREDICTION_LIMIT,
                    phoneNumber: user.phoneNumber,
                    suggestion: 'Use a different phone number to get more predictions'
                }
            });
        }
        
        console.log(`✅ ALLOWING PREDICTION for ${user.phoneNumber}`);
        console.log(`🎉 Reason: ${hasUnlimited ? 'ADMIN/UNLIMITED ACCESS' : 'WITHIN LIMIT'}`);
        console.log('='.repeat(60));
        
        // Find rank prediction (existing code)
        const prediction = nimcetRankData.find(p => 
            marks >= p.minMarks && marks <= p.maxMarks && p.category === category
        );
        
        if (!prediction) {
            console.log(`❌ No prediction data found for ${marks} marks in ${category} category`);
            return res.json({
                success: false,
                message: `No prediction available for ${marks} marks in ${category} category. Please check your marks.`
            });
        }
        
        console.log(`📈 Prediction Found: Rank ${prediction.minRank} - ${prediction.maxRank}`);
        
        // Get eligible colleges
        const eligibleColleges = getEligibleColleges(prediction.minRank, prediction.maxRank, category);
        console.log(`🏫 Eligible Colleges: ${eligibleColleges.length}`);
        
        // Calculate additional statistics
        const percentage = ((marks / 1000) * 100).toFixed(2);
        const totalCandidates = 200000;
        const percentile = (((totalCandidates - prediction.maxRank) / totalCandidates) * 100).toFixed(2);
        
        // Save prediction to MongoDB
        const newPrediction = new Prediction({
            userId: user._id,
            userDetails: {
                fullName: user.fullName,
                phoneNumber: user.phoneNumber
            },
            marks: parseInt(marks),
            category,
            predictedMinRank: prediction.minRank,
            predictedMaxRank: prediction.maxRank,
            eligibleColleges: eligibleColleges.length,
            additionalInfo: {
                percentage: parseFloat(percentage),
                percentile: parseFloat(percentile),
                candidatesAhead: prediction.maxRank - 1,
                candidatesBehind: totalCandidates - prediction.minRank
            }
        });
        
        await newPrediction.save();
        console.log(`💾 Prediction saved to database`);
        
        // Calculate remaining predictions (for non-admin users)
        const newPredictionCount = existingPredictions + 1;
        const remainingPredictions = hasUnlimited ? 999 : Math.max(0, PREDICTION_LIMIT - newPredictionCount);
        
        console.log(`📊 Final Count: ${newPredictionCount} used, ${remainingPredictions} remaining`);
        console.log(`🎯 Response ready for ${user.fullName}`);
        console.log('='.repeat(60) + '\n');
        
        res.json({
            success: true,
            prediction: {
                marks: parseInt(marks),
                category,
                rankRange: {
                    min: prediction.minRank,
                    max: prediction.maxRank
                },
                message: `Hi ${user.fullName}! Your predicted NIMCET rank is between ${prediction.minRank.toLocaleString()} and ${prediction.maxRank.toLocaleString()}`,
                additionalInfo: {
                    totalMarks: 1000,
                    percentage: percentage,
                    percentile: percentile,
                    examName: 'NIMCET 2024',
                    candidatesAhead: prediction.maxRank - 1,
                    candidatesBehind: totalCandidates - prediction.minRank
                },
                colleges: eligibleColleges,
                statistics: {
                    totalColleges: nimcetColleges.length,
                    eligibleColleges: eligibleColleges.length,
                    highChanceColleges: eligibleColleges.filter(c => c.chance >= 75).length,
                    moderateChanceColleges: eligibleColleges.filter(c => c.chance >= 50 && c.chance < 75).length,
                    lowChanceColleges: eligibleColleges.filter(c => c.chance < 50).length
                }
            },
            // 🆕 NEW: Prediction Usage Info with Admin Status
            usageInfo: {
                predictionsUsed: newPredictionCount,
                predictionsRemaining: hasUnlimited ? 'Unlimited' : remainingPredictions,
                totalAllowed: hasUnlimited ? 'Unlimited (Admin)' : PREDICTION_LIMIT,
                phoneNumber: user.phoneNumber.replace(/(.{3})(.{3})(.{4})/, '$1***$3'), // Masked phone number
                adminStatus: hasUnlimited ? 'Admin/Premium User' : 'Regular User'
            }
        });
        
    } catch (error) {
        console.error('❌ Predict Rank Error:', error.message);
        console.error('🔍 Error Stack:', error.stack);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to predict rank. Please try again.'
        });
    }
});

// Get all colleges (for reference)
app.get('/api/colleges', (req, res) => {
    try {
        const { category, tier, limit } = req.query;
        let filteredColleges = [...nimcetColleges];
        
        // Filter by tier if specified
        if (tier && tier !== 'all') {
            filteredColleges = filteredColleges.filter(college => college.tier.toString() === tier);
        }
        
        // Add cutoff information for specified category
        if (category) {
            filteredColleges = filteredColleges.map(college => ({
                ...college,
                categorySpecificCutoff: college.cutoffs[category] || null
            }));
        }
        
        // Limit results if specified
        if (limit) {
            filteredColleges = filteredColleges.slice(0, parseInt(limit));
        }
        
        res.json({ 
            success: true, 
            colleges: filteredColleges,
                        total: filteredColleges.length,
            totalAvailable: nimcetColleges.length
        });
    } catch (error) {
        console.error('Get Colleges Error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch colleges' });
    }
});


app.get('/api/user/prediction-limit', async (req, res) => {
    try {
        const { token } = req.query;
        
        if (!token) {
            return res.status(400).json({ success: false, message: 'Token is required' });
        }
        
        const user = await User.findOne({ sessionToken: token, isVerified: true });
        if (!user) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        
        const PREDICTION_LIMIT = PREDICTION_CONFIG.LIMIT_PER_PHONE; // Use config
        const predictionsUsed = await Prediction.countDocuments({ userId: user._id });
        const remainingPredictions = Math.max(0, PREDICTION_LIMIT - predictionsUsed);
        
        res.json({
            success: true,
            usageInfo: {
                predictionsUsed: predictionsUsed,
                predictionsRemaining: remainingPredictions,
                totalAllowed: PREDICTION_LIMIT,
                canPredict: remainingPredictions > 0,
                phoneNumber: user.phoneNumber.replace(/(.{3})(.{3})(.{4})/, '$1***$3'),
                user: user.fullName
            }
        });
        
    } catch (error) {
        console.error('Check Limit Error:', error);
        res.status(500).json({ success: false, error: 'Failed to check prediction limit' });
    }
});

app.get('/api/user/predictions', async (req, res) => {
    try {
        const { token } = req.query;
        
        if (!token) {
            return res.status(400).json({ success: false, message: 'Token is required' });
        }
        
        const user = await User.findOne({ sessionToken: token, isVerified: true });
        if (!user) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        
        const userPredictions = await Prediction.find({ userId: user._id })
            .sort({ createdAt: -1 })
            .populate('userId', 'fullName phoneNumber createdAt');
        
        res.json({
            success: true,
            predictions: userPredictions,
            total: userPredictions.length,
            user: {
                fullName: user.fullName,
                phoneNumber: user.phoneNumber,
                memberSince: user.createdAt
            }
        });
    } catch (error) {
        console.error('Get User Predictions Error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch predictions' });
    }
});

// Admin endpoint to get all predictions (Updated for MongoDB)
app.get('/api/admin/predictions', async (req, res) => {
    try {
        const { adminKey } = req.query;
        
        // Simple admin authentication
        if (adminKey !== process.env.ADMIN_KEY && adminKey !== 'admin123') {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        
        const predictions = await Prediction.find().populate('userId', 'fullName phoneNumber createdAt');
        const users = await User.find();
        
        // Calculate statistics
        const stats = {
            totalPredictions: predictions.length,
            totalUsers: users.length,
            verifiedUsers: users.filter(u => u.isVerified).length,
            categoriesBreakdown: {},
            marksDistribution: {},
            recentActivity: predictions.slice(-10)
        };
        
        // Calculate category breakdown
        predictions.forEach(p => {
            stats.categoriesBreakdown[p.category] = (stats.categoriesBreakdown[p.category] || 0) + 1;
        });
        
        // Calculate marks distribution
        predictions.forEach(p => {
            const marksRange = Math.floor(p.marks / 100) * 100;
            const rangeLabel = `${marksRange}-${marksRange + 99}`;
            stats.marksDistribution[rangeLabel] = (stats.marksDistribution[rangeLabel] || 0) + 1;
        });
        
        res.json({ 
            success: true, 
            predictions,
            statistics: stats
        });
    } catch (error) {
        console.error('Admin Predictions Error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch admin data' });
    }
});

app.post('/api/logout', async (req, res) => {
    try {
        const { token } = req.body;
        
        const user = await User.findOne({ sessionToken: token });
        if (user) {
            user.sessionToken = null;
            user.lastLoginAt = new Date();
            await user.save();
        }
        
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout Error:', error);
        res.status(500).json({ success: false, error: 'Failed to logout' });
    }
});

// Add this after your existing routes (around line 800)

// FIXED Export data to Excel endpoint with proper error handling
app.get('/api/admin/export-excel', async (req, res) => {
    try {
        const { adminKey, collection } = req.query;
        
        // Admin authentication
        if (adminKey !== process.env.ADMIN_KEY && adminKey !== 'admin123') {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        
        let data;
        let filename;
        
        if (collection === 'users' || !collection) {
            // Export Users Data - SAFE VERSION
            const users = await User.find().select('-otp -otpExpiry -sessionToken');
            data = users.map(user => ({
                'Full Name': user.fullName || 'N/A',
                'Phone Number': `'${user.phoneNumber || 'N/A'}`,
                'Verified': user.isVerified ? 'Yes' : 'No',
                'Member Since': user.createdAt ? user.createdAt.toISOString().split('T')[0] : 'N/A',
                'Last Login': user.lastLoginAt ? user.lastLoginAt.toISOString().split('T')[0] : 'Never',
                'Total Predictions': 0
            }));
            filename = 'nimcet_users_data.csv';
        }
        
        if (collection === 'predictions' || !collection) {
            // Export Predictions Data - SAFE VERSION
            const predictions = await Prediction.find().populate('userId', 'fullName phoneNumber createdAt');
            data = predictions.map(pred => ({
                'Student Name': pred.userDetails?.fullName || 'N/A',
                'Phone Number': `'${pred.userDetails?.phoneNumber || 'N/A'}`,
                'Marks': pred.marks || 0,
                'Category': pred.category || 'N/A',
                'Predicted Min Rank': pred.predictedMinRank || 0,
                'Predicted Max Rank': pred.predictedMaxRank || 0,
                'Eligible Colleges': pred.eligibleColleges || 0,
                'Percentage': pred.additionalInfo?.percentage || 0,
                'Percentile': pred.additionalInfo?.percentile || 0,
                'Prediction Date': pred.createdAt ? pred.createdAt.toISOString().split('T')[0] : 'N/A',
                'Prediction Time': pred.createdAt ? pred.createdAt.toISOString().split('T')[1].split('.')[0] : 'N/A'
            }));
            filename = 'nimcet_predictions_data.csv';
        }
        
        // Convert to CSV format with proper escaping
        if (data && data.length > 0) {
            const headers = Object.keys(data[0]);
            const csvContent = [
                headers.join(','),
                ...data.map(row => headers.map(header => {
                    let value = row[header] || '';
                    if (header === 'Phone Number') {
                        value = `"'${value.replace(/'/g, '')}"`;
                    } else {
                        value = `"${value}"`;
                    }
                    return value;
                }).join(','))
            ].join('\n');
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(csvContent);
        } else {
            res.json({ success: false, message: 'No data found' });
        }
        
    } catch (error) {
        console.error('Export Error:', error);
        res.status(500).json({ success: false, error: 'Failed to export data' });
    }
});

// FIXED Export combined data with proper null checks
app.get('/api/admin/export-all', async (req, res) => {
    try {
        const { adminKey } = req.query;
        
        if (adminKey !== process.env.ADMIN_KEY && adminKey !== 'admin123') {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        
        const users = await User.find().select('-otp -otpExpiry -sessionToken');
        const predictions = await Prediction.find().populate('userId', 'fullName phoneNumber createdAt');
        
        // SAFE data mapping with null checks
        const combinedData = predictions.map(pred => ({
            'Student Name': pred.userDetails?.fullName || 'N/A',
            'Phone Number': `'${pred.userDetails?.phoneNumber || 'N/A'}`,
            'Marks': pred.marks || 0,
            'Category': pred.category || 'N/A',
            'Predicted Min Rank': pred.predictedMinRank || 0,
            'Predicted Max Rank': pred.predictedMaxRank || 0,
            'Rank Range': `${pred.predictedMinRank || 0} - ${pred.predictedMaxRank || 0}`,
            'Eligible Colleges': pred.eligibleColleges || 0,
            'Percentage': (pred.additionalInfo?.percentage || 0) + '%',
            'Percentile': (pred.additionalInfo?.percentile || 0) + '%',
            'Member Since': (pred.userId && pred.userId.createdAt) ? pred.userId.createdAt.toISOString().split('T')[0] : 'N/A',
            'Prediction Date': pred.createdAt ? pred.createdAt.toISOString().split('T')[0] : 'N/A',
            'Prediction Time': pred.createdAt ? pred.createdAt.toISOString().split('T')[1].split('.')[0] : 'N/A'
        }));
        
        // Check if we have data
        if (combinedData.length === 0) {
            return res.json({ success: false, message: 'No predictions found in database' });
        }
        
        // Safe CSV generation
        const headers = Object.keys(combinedData[0]);
        const csvContent = [
            headers.join(','),
            ...combinedData.map(row => headers.map(header => {
                let value = row[header] || '';
                if (header === 'Phone Number') {
                    value = `"'${value.replace(/'/g, '')}"`;
                } else {
                    value = `"${value}"`;
                }
                return value;
            }).join(','))
        ].join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="nimcet_complete_data.csv"');
        res.send(csvContent);
        
    } catch (error) {
        console.error('Export All Error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to export complete data',
            details: error.message 
        });
    }
});
// Admin SMS Statistics Endpoint
app.get('/api/admin/sms-stats', (req, res) => {
    const { adminKey } = req.query;
    
    if (adminKey !== process.env.ADMIN_KEY && adminKey !== 'admin123') {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    const savings = (smsStats.twilio.count * 7.11) - (smsStats.msg91.count * 0.20);
    
    res.json({
        success: true,
        smsStatistics: {
            totalSMS: smsStats.total.count,
            totalCost: `₹${smsStats.total.cost.toFixed(2)}`,
            providers: {
                msg91: {
                    count: smsStats.msg91.count,
                    cost: `₹${smsStats.msg91.cost.toFixed(2)}`,
                    rate: '₹0.20 per SMS'
                },
                twilio: {
                    count: smsStats.twilio.count,
                    cost: `₹${smsStats.twilio.cost.toFixed(2)}`,
                    rate: '₹7.11 per SMS'
                }
            },
            savings: {
                amount: `₹${savings.toFixed(2)}`,
                percentage: `${((savings / (smsStats.total.count * 7.11)) * 100).toFixed(1)}%`
            },
            projectedMonthlyCost: {
                current: `₹${(smsStats.total.cost * 30).toFixed(2)}`,
                ifAllTwilio: `₹${(smsStats.total.count * 7.11 * 30).toFixed(2)}`
            }
        }
    });
});

/// ENHANCED: Admin Reset Limit (GET method for browser)
app.get('/api/admin/reset-limit', async (req, res) => {
    try {
        const { adminKey, phoneNumber } = req.query;
        
        if (adminKey !== process.env.ADMIN_KEY && adminKey !== 'admin123') {
            return res.status(401).json({ success: false, message: 'Unauthorized - Invalid admin key' });
        }
        
        if (!phoneNumber) {
            return res.status(400).json({ success: false, message: 'Phone number is required' });
        }
        
        const user = await User.findOne({ phoneNumber });
        if (!user) {
            return res.status(404).json({ success: false, message: `User with phone ${phoneNumber} not found` });
        }
        
        // Get current prediction count
        const currentPredictions = await Prediction.countDocuments({ userId: user._id });
        
        // Delete all predictions for this user (reset limit)
        const deletedResult = await Prediction.deleteMany({ userId: user._id });
        
        // Clear any existing session to force fresh login
        user.sessionToken = null;
        user.otp = null;
        user.otpExpiry = null;
        user.isVerified = false;
        await user.save();
        
        console.log(`🔄 ADMIN RESET - Phone: ${phoneNumber}, Deleted: ${deletedResult.deletedCount} predictions`);
        
        res.json({
            success: true,
            message: `✅ Prediction limit reset successfully for ${phoneNumber}`,
            details: {
                phoneNumber: phoneNumber,
                userName: user.fullName,
                deletedPredictions: deletedResult.deletedCount,
                previousLimit: currentPredictions,
                newLimit: 0,
                canRequestOtp: true,
                resetBy: 'Admin',
                resetTime: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('Admin Reset Error:', error);
        res.status(500).json({ success: false, error: 'Failed to reset limit', details: error.message });
    }
});

// ENHANCED: Admin Reset Limit (POST method for API calls)
app.post('/api/admin/reset-limit', async (req, res) => {
    try {
        const { adminKey, phoneNumber } = req.body;
        
        if (adminKey !== process.env.ADMIN_KEY && adminKey !== 'admin123') {
            return res.status(401).json({ success: false, message: 'Unauthorized - Invalid admin key' });
        }
        
        if (!phoneNumber) {
            return res.status(400).json({ success: false, message: 'Phone number is required' });
        }
        
        const user = await User.findOne({ phoneNumber });
        if (!user) {
            return res.status(404).json({ success: false, message: `User with phone ${phoneNumber} not found` });
        }
        
        // Get current prediction count
        const currentPredictions = await Prediction.countDocuments({ userId: user._id });
        
        // Delete all predictions for this user (reset limit)
        const deletedResult = await Prediction.deleteMany({ userId: user._id });
        
        // Clear any existing session to force fresh login
        user.sessionToken = null;
        user.otp = null;
        user.otpExpiry = null;
        user.isVerified = false;
        await user.save();
        
        console.log(`🔄 ADMIN RESET (POST) - Phone: ${phoneNumber}, Deleted: ${deletedResult.deletedCount} predictions`);
        
        res.json({
            success: true,
            message: `✅ Prediction limit reset successfully for ${phoneNumber}`,
            details: {
                phoneNumber: phoneNumber,
                userName: user.fullName,
                deletedPredictions: deletedResult.deletedCount,
                previousLimit: currentPredictions,
                newLimit: 0,
                canRequestOtp: true,
                resetBy: 'Admin',
                resetTime: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('Admin Reset Error (POST):', error);
        res.status(500).json({ success: false, error: 'Failed to reset limit', details: error.message });
    }
});
// Health check endpoint (Updated for MongoDB)
app.get('/health', async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalPredictions = await Prediction.countDocuments();
        const verifiedUsers = await User.countDocuments({ isVerified: true });
        
        res.json({ 
            status: 'OK', 
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: '3.0.0',
            database: 'MongoDB',
            examInfo: {
                name: 'NIMCET 2024',
                totalMarks: 1000,
                totalQuestions: 120
            },
            data: {
                colleges: nimcetColleges.length,
                rankRanges: nimcetRankData.length,
                totalUsers: totalUsers,
                totalPredictions: totalPredictions,
                verifiedUsers: verifiedUsers
            },
            features: [
                'Phone Verification with SMS',
                'Full Name Collection',
                'MongoDB Database Storage',
                'Rank Prediction (1000 marks)',
                'College Recommendations', 
                'Category-wise Analysis',
                'Admission Chances Calculator',
                'College Filtering System',
                'Prediction Limits (3 per phone)',
                'Admin Reset Functionality'
            ],
            availableEndpoints: [
                'POST /api/send-otp',
                'POST /api/verify-otp', 
                'POST /api/predict-rank',
                'GET /api/colleges',
                'GET /api/user/predictions',
                'GET /api/user/prediction-limit',
                'GET /api/admin/predictions',
                'POST /api/admin/reset-limit',
                'POST /api/logout',
                'GET /health'
            ]
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'ERROR', 
            error: 'Health check failed',
            timestamp: new Date().toISOString()
        });
    }
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({ 
        success: false, 
        error: 'API endpoint not found',
        availableEndpoints: [
            'POST /api/send-otp',
            'POST /api/verify-otp', 
            'POST /api/predict-rank',
            'GET /api/colleges',
            'GET /api/user/predictions',
            'GET /api/user/prediction-limit',
            'GET /api/admin/predictions',
            'POST /api/admin/reset-limit',
            'POST /api/logout',
            'GET /health'
        ]
    });
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err);
    res.status(500).json({ 
        success: false, 
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message 
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    mongoose.connection.close(() => {
        console.log('MongoDB connection closed.');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received. Shutting down gracefully...');
    mongoose.connection.close(() => {
        console.log('MongoDB connection closed.');
        process.exit(0);
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 NIMCET Rank Predictor Server running on http://localhost:${PORT}`);
    console.log(`📱 Check console for OTP messages`);
    console.log(`🏫 ${nimcetColleges.length} colleges loaded`);
    console.log(`📊 ${nimcetRankData.length} rank prediction ranges loaded`);
    console.log(`🎯 Total Marks: 1000 | Total Questions: 120`);
    console.log(`⚡ Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📈 Health Check: http://localhost:${PORT}/health`);
    console.log(`🔗 API Documentation: http://localhost:${PORT}/api/*`);
    console.log(`\n✅ Server ready for NIMCET rank predictions!`);
});