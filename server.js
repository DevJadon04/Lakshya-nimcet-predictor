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

// SMS Function
const sendSMS = async (phoneNumber, message) => {
    try {
        if (!SMS_ENABLED) {
            console.log(`📱 SMS DISABLED - Would send to ${phoneNumber}: ${message}`);
            return { success: true, method: 'console' };
        }

        const result = await twilioClient.messages.create({
            body: message,
            from: TWILIO_PHONE_NUMBER,
            to: `+91${phoneNumber}`
        });

        console.log(`✅ SMS sent successfully to ${phoneNumber} - SID: ${result.sid}`);
        return { success: true, sid: result.sid, method: 'twilio' };
        
    } catch (error) {
        console.error(`❌ SMS failed for ${phoneNumber}:`, error.message);
        console.log(`📱 FALLBACK - OTP for ${phoneNumber}: ${message.split(': ')[1].split('.')[0]}`);
        return { success: false, error: error.message, method: 'fallback' };
    }
};

// Helper functions
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// NIMCET Colleges Data with Cutoff Ranks
const nimcetColleges = [
    // Tier 1 NITs
    {
        name: "NIT Trichy (National Institute of Technology, Tiruchirappalli)",
        location: "Tiruchirappalli, Tamil Nadu",
        type: "NIT",
        tier: 1,
        cutoffs: {
            General: { min: 1, max: 150 },
            OBC: { min: 1, max: 200 },
            SC: { min: 1, max: 350 },
            ST: { min: 1, max: 400 },
            PWD: { min: 1, max: 300 }
        },
        fees: "₹1.5 Lakhs (Total)",
        duration: "3 Years",
        seats: 60,
        highlights: ["Top NIT for MCA", "Excellent Placement Record", "Industry Partnerships"]
    },
    {
        name: "NIT Warangal (National Institute of Technology, Warangal)",
        location: "Warangal, Telangana",
        type: "NIT",
        tier: 1,
        cutoffs: {
            General: { min: 1, max: 180 },
            OBC: { min: 1, max: 250 },
            SC: { min: 1, max: 400 },
            ST: { min: 1, max: 450 },
            PWD: { min: 1, max: 350 }
        },
        fees: "₹1.4 Lakhs (Total)",
        duration: "3 Years",
        seats: 54,
        highlights: ["Research Excellence", "Strong Alumni Network", "Tech Giants Recruitment"]
    },
    {
        name: "NIT Surathkal (National Institute of Technology Karnataka)",
        location: "Surathkal, Karnataka",
        type: "NIT",
        tier: 1,
        cutoffs: {
            General: { min: 1, max: 200 },
            OBC: { min: 1, max: 280 },
            SC: { min: 1, max: 450 },
            ST: { min: 1, max: 500 },
            PWD: { min: 1, max: 400 }
        },
        fees: "₹1.6 Lakhs (Total)",
        duration: "3 Years",
        seats: 48,
        highlights: ["Coastal Campus", "Strong Industry Connect", "International Collaborations"]
    },
    {
        name: "NIT Allahabad (Motilal Nehru National Institute of Technology)",
        location: "Prayagraj, Uttar Pradesh",
        type: "NIT",
        tier: 1,
        cutoffs: {
            General: { min: 120, max: 300 },
            OBC: { min: 150, max: 400 },
            SC: { min: 200, max: 600 },
            ST: { min: 250, max: 700 },
            PWD: { min: 200, max: 500 }
        },
        fees: "₹1.3 Lakhs (Total)",
        duration: "3 Years",
        seats: 60,
        highlights: ["Historic Institution", "Strong Faculty", "Good Placement Support"]
    },
    {
        name: "NIT Calicut (National Institute of Technology Calicut)",
        location: "Kozhikode, Kerala",
        type: "NIT",
        tier: 1,
        cutoffs: {
            General: { min: 150, max: 350 },
            OBC: { min: 200, max: 450 },
            SC: { min: 300, max: 700 },
            ST: { min: 350, max: 800 },
            PWD: { min: 250, max: 600 }
        },
        fees: "₹1.5 Lakhs (Total)",
        duration: "3 Years",
        seats: 45,
        highlights: ["Beautiful Campus", "Quality Education", "Cultural Diversity"]
    },

    // Tier 2 NITs
    {
        name: "NIT Bhopal (Maulana Azad National Institute of Technology)",
        location: "Bhopal, Madhya Pradesh",
        type: "NIT",
        tier: 2,
        cutoffs: {
            General: { min: 300, max: 600 },
            OBC: { min: 400, max: 800 },
            SC: { min: 600, max: 1200 },
            ST: { min: 700, max: 1400 },
            PWD: { min: 500, max: 1000 }
        },
        fees: "₹1.2 Lakhs (Total)",
        duration: "3 Years",
        seats: 54,
        highlights: ["Central Location", "Growing Reputation", "Affordable Fees"]
    },
    {
        name: "NIT Jaipur (Malaviya National Institute of Technology)",
        location: "Jaipur, Rajasthan",
        type: "NIT",
        tier: 2,
        cutoffs: {
            General: { min: 400, max: 800 },
            OBC: { min: 500, max: 1000 },
            SC: { min: 800, max: 1500 },
            ST: { min: 900, max: 1700 },
            PWD: { min: 600, max: 1200 }
        },
        fees: "₹1.3 Lakhs (Total)",
        duration: "3 Years",
        seats: 48,
        highlights: ["Pink City Campus", "Industry Connections", "Cultural Heritage"]
    },
    {
        name: "NIT Kurukshetra (National Institute of Technology Kurukshetra)",
        location: "Kurukshetra, Haryana",
        type: "NIT",
        tier: 2,
        cutoffs: {
            General: { min: 350, max: 700 },
            OBC: { min: 450, max: 900 },
            SC: { min: 700, max: 1400 },
            ST: { min: 800, max: 1600 },
            PWD: { min: 550, max: 1100 }
        },
        fees: "₹1.4 Lakhs (Total)",
        duration: "3 Years",
        seats: 54,
        highlights: ["NCR Proximity", "Good Connectivity", "Emerging Programs"]
    },
    {
        name: "NIT Durgapur (National Institute of Technology Durgapur)",
        location: "Durgapur, West Bengal",
        type: "NIT",
        tier: 2,
        cutoffs: {
            General: { min: 500, max: 1000 },
            OBC: { min: 600, max: 1200 },
            SC: { min: 1000, max: 2000 },
            ST: { min: 1200, max: 2300 },
            PWD: { min: 800, max: 1600 }
        },
        fees: "₹1.1 Lakhs (Total)",
        duration: "3 Years",
        seats: 45,
        highlights: ["Industrial Belt", "Research Opportunities", "Lower Fees"]
    },
    {
        name: "NIT Rourkela (National Institute of Technology Rourkela)",
        location: "Rourkela, Odisha",
        type: "NIT",
        tier: 2,
        cutoffs: {
            General: { min: 400, max: 750 },
            OBC: { min: 500, max: 950 },
            SC: { min: 800, max: 1500 },
            ST: { min: 900, max: 1700 },
            PWD: { min: 600, max: 1200 }
        },
        fees: "₹1.2 Lakhs (Total)",
        duration: "3 Years",
        seats: 48,
        highlights: ["Large Campus", "Sports Excellence", "Technical Festivals"]
    },

    // Tier 3 NITs
    {
        name: "NIT Patna (National Institute of Technology Patna)",
        location: "Patna, Bihar",
        type: "NIT",
        tier: 3,
        cutoffs: {
            General: { min: 800, max: 1500 },
            OBC: { min: 1000, max: 1800 },
            SC: { min: 1500, max: 3000 },
            ST: { min: 1800, max: 3500 },
            PWD: { min: 1200, max: 2500 }
        },
        fees: "₹1.0 Lakhs (Total)",
        duration: "3 Years",
        seats: 45,
        highlights: ["Developing Infrastructure", "Growing Placement", "Affordable Education"]
    },
    {
        name: "NIT Jamshedpur (National Institute of Technology Jamshedpur)",
        location: "Jamshedpur, Jharkhand",
        type: "NIT",
        tier: 3,
        cutoffs: {
            General: { min: 700, max: 1400 },
            OBC: { min: 900, max: 1700 },
            SC: { min: 1400, max: 2800 },
            ST: { min: 1700, max: 3200 },
            PWD: { min: 1100, max: 2300 }
        },
        fees: "₹1.1 Lakhs (Total)",
        duration: "3 Years",
        seats: 48,
        highlights: ["Steel City", "Industrial Exposure", "Hands-on Learning"]
    },
    {
        name: "NIT Silchar (National Institute of Technology Silchar)",
        location: "Silchar, Assam",
        type: "NIT",
        tier: 3,
        cutoffs: {
            General: { min: 1000, max: 2000 },
            OBC: { min: 1200, max: 2300 },
            SC: { min: 2000, max: 4000 },
            ST: { min: 2300, max: 4500 },
            PWD: { min: 1500, max: 3200 }
        },
        fees: "₹0.9 Lakhs (Total)",
        duration: "3 Years",
        seats: 42,
        highlights: ["Northeast Hub", "Scenic Location", "Lower Competition"]
    },
    {
        name: "NIT Agartala (National Institute of Technology Agartala)",
        location: "Agartala, Tripura",
        type: "NIT",
        tier: 3,
        cutoffs: {
            General: { min: 1200, max: 2500 },
            OBC: { min: 1500, max: 2800 },
            SC: { min: 2500, max: 5000 },
            ST: { min: 2800, max: 5500 },
            PWD: { min: 1800, max: 4000 }
        },
        fees: "₹0.8 Lakhs (Total)",
        duration: "3 Years",
        seats: 36,
        highlights: ["Border State", "Cultural Diversity", "Emerging Institute"]
    },
    {
        name: "NIT Arunachal Pradesh (National Institute of Technology Arunachal Pradesh)",
        location: "Yupia, Arunachal Pradesh",
        type: "NIT",
        tier: 3,
        cutoffs: {
            General: { min: 1500, max: 3000 },
            OBC: { min: 1800, max: 3500 },
            SC: { min: 3000, max: 6000 },
            ST: { min: 3500, max: 7000 },
            PWD: { min: 2200, max: 4800 }
        },
        fees: "₹0.7 Lakhs (Total)",
        duration: "3 Years",
        seats: 30,
        highlights: ["Mountain Campus", "Newest NIT", "Unique Experience"]
    },

    // Other Central Institutions
    {
        name: "BIT Mesra (Birla Institute of Technology)",
        location: "Ranchi, Jharkhand",
        type: "Private Deemed University",
        tier: 2,
        cutoffs: {
            General: { min: 500, max: 1200 },
            OBC: { min: 600, max: 1400 },
            SC: { min: 1000, max: 2200 },
            ST: { min: 1200, max: 2500 },
            PWD: { min: 800, max: 1800 }
        },
        fees: "₹4.5 Lakhs (Total)",
        duration: "3 Years",
        seats: 120,
        highlights: ["Private University", "Industry Partnerships", "Multiple Campuses"]
    },
    {
        name: "Thapar Institute of Engineering and Technology",
        location: "Patiala, Punjab",
        type: "Private Deemed University",
        tier: 2,
        cutoffs: {
            General: { min: 400, max: 1000 },
            OBC: { min: 500, max: 1200 },
            SC: { min: 800, max: 1800 },
            ST: { min: 1000, max: 2000 },
            PWD: { min: 600, max: 1500 }
        },
        fees: "₹5.2 Lakhs (Total)",
        duration: "3 Years",
        seats: 80,
        highlights: ["Strong Alumni", "International Programs", "Research Focus"]
    }
];

// NIMCET rank prediction data (Updated for 1000 marks)
const nimcetRankData = [
    // General Category
    { minMarks: 950, maxMarks: 1000, minRank: 1, maxRank: 10, category: 'General' },
    { minMarks: 900, maxMarks: 949, minRank: 11, maxRank: 50, category: 'General' },
    { minMarks: 850, maxMarks: 899, minRank: 51, maxRank: 150, category: 'General' },
    { minMarks: 800, maxMarks: 849, minRank: 151, maxRank: 300, category: 'General' },
    { minMarks: 750, maxMarks: 799, minRank: 301, maxRank: 500, category: 'General' },
    { minMarks: 700, maxMarks: 749, minRank: 501, maxRank: 800, category: 'General' },
    { minMarks: 650, maxMarks: 699, minRank: 801, maxRank: 1200, category: 'General' },
    { minMarks: 600, maxMarks: 649, minRank: 1201, maxRank: 1800, category: 'General' },
    { minMarks: 550, maxMarks: 599, minRank: 1801, maxRank: 2500, category: 'General' },
    { minMarks: 500, maxMarks: 549, minRank: 2501, maxRank: 3500, category: 'General' },
    { minMarks: 450, maxMarks: 499, minRank: 3501, maxRank: 5000, category: 'General' },
    { minMarks: 400, maxMarks: 449, minRank: 5001, maxRank: 7000, category: 'General' },
    { minMarks: 350, maxMarks: 399, minRank: 7001, maxRank: 10000, category: 'General' },
        { minMarks: 300, maxMarks: 349, minRank: 10001, maxRank: 13000, category: 'General' },
    { minMarks: 250, maxMarks: 299, minRank: 13001, maxRank: 16000, category: 'General' },
    { minMarks: 200, maxMarks: 249, minRank: 16001, maxRank: 20000, category: 'General' },
    
    // OBC Category
    { minMarks: 900, maxMarks: 1000, minRank: 1, maxRank: 20, category: 'OBC' },
    { minMarks: 850, maxMarks: 899, minRank: 21, maxRank: 80, category: 'OBC' },
    { minMarks: 800, maxMarks: 849, minRank: 81, maxRank: 200, category: 'OBC' },
    { minMarks: 750, maxMarks: 799, minRank: 201, maxRank: 400, category: 'OBC' },
    { minMarks: 700, maxMarks: 749, minRank: 401, maxRank: 650, category: 'OBC' },
    { minMarks: 650, maxMarks: 699, minRank: 651, maxRank: 1000, category: 'OBC' },
    { minMarks: 600, maxMarks: 649, minRank: 1001, maxRank: 1500, category: 'OBC' },
    { minMarks: 550, maxMarks: 599, minRank: 1501, maxRank: 2200, category: 'OBC' },
    { minMarks: 500, maxMarks: 549, minRank: 2201, maxRank: 3200, category: 'OBC' },
    { minMarks: 450, maxMarks: 499, minRank: 3201, maxRank: 4500, category: 'OBC' },
    { minMarks: 400, maxMarks: 449, minRank: 4501, maxRank: 6500, category: 'OBC' },
    { minMarks: 350, maxMarks: 399, minRank: 6501, maxRank: 9000, category: 'OBC' },
    { minMarks: 300, maxMarks: 349, minRank: 9001, maxRank: 12000, category: 'OBC' },
    { minMarks: 250, maxMarks: 299, minRank: 12001, maxRank: 15000, category: 'OBC' },
    { minMarks: 200, maxMarks: 249, minRank: 15001, maxRank: 18000, category: 'OBC' },
    
    // SC Category
    { minMarks: 850, maxMarks: 1000, minRank: 1, maxRank: 30, category: 'SC' },
    { minMarks: 800, maxMarks: 849, minRank: 31, maxRank: 100, category: 'SC' },
    { minMarks: 750, maxMarks: 799, minRank: 101, maxRank: 250, category: 'SC' },
    { minMarks: 700, maxMarks: 749, minRank: 251, maxRank: 450, category: 'SC' },
    { minMarks: 650, maxMarks: 699, minRank: 451, maxRank: 700, category: 'SC' },
    { minMarks: 600, maxMarks: 649, minRank: 701, maxRank: 1100, category: 'SC' },
    { minMarks: 550, maxMarks: 599, minRank: 1101, maxRank: 1600, category: 'SC' },
    { minMarks: 500, maxMarks: 549, minRank: 1601, maxRank: 2300, category: 'SC' },
    { minMarks: 450, maxMarks: 499, minRank: 2301, maxRank: 3300, category: 'SC' },
    { minMarks: 400, maxMarks: 449, minRank: 3301, maxRank: 4800, category: 'SC' },
    { minMarks: 350, maxMarks: 399, minRank: 4801, maxRank: 6800, category: 'SC' },
    { minMarks: 300, maxMarks: 349, minRank: 6801, maxRank: 9500, category: 'SC' },
    { minMarks: 250, maxMarks: 299, minRank: 9501, maxRank: 13000, category: 'SC' },
    { minMarks: 200, maxMarks: 249, minRank: 13001, maxRank: 16000, category: 'SC' },
    
    // ST Category
    { minMarks: 800, maxMarks: 1000, minRank: 1, maxRank: 50, category: 'ST' },
    { minMarks: 750, maxMarks: 799, minRank: 51, maxRank: 150, category: 'ST' },
    { minMarks: 700, maxMarks: 749, minRank: 151, maxRank: 350, category: 'ST' },
    { minMarks: 650, maxMarks: 699, minRank: 351, maxRank: 600, category: 'ST' },
    { minMarks: 600, maxMarks: 649, minRank: 601, maxRank: 900, category: 'ST' },
    { minMarks: 550, maxMarks: 599, minRank: 901, maxRank: 1300, category: 'ST' },
    { minMarks: 500, maxMarks: 549, minRank: 1301, maxRank: 1900, category: 'ST' },
    { minMarks: 450, maxMarks: 499, minRank: 1901, maxRank: 2700, category: 'ST' },
    { minMarks: 400, maxMarks: 449, minRank: 2701, maxRank: 3800, category: 'ST' },
    { minMarks: 350, maxMarks: 399, minRank: 3801, maxRank: 5300, category: 'ST' },
    { minMarks: 300, maxMarks: 349, minRank: 5301, maxRank: 7500, category: 'ST' },
    { minMarks: 250, maxMarks: 299, minRank: 7501, maxRank: 10500, category: 'ST' },
    { minMarks: 200, maxMarks: 249, minRank: 10501, maxRank: 14000, category: 'ST' },
    
    // PWD Category
    { minMarks: 800, maxMarks: 1000, minRank: 1, maxRank: 25, category: 'PWD' },
    { minMarks: 750, maxMarks: 799, minRank: 26, maxRank: 80, category: 'PWD' },
    { minMarks: 700, maxMarks: 749, minRank: 81, maxRank: 180, category: 'PWD' },
    { minMarks: 650, maxMarks: 699, minRank: 181, maxRank: 320, category: 'PWD' },
    { minMarks: 600, maxMarks: 649, minRank: 321, maxRank: 500, category: 'PWD' },
    { minMarks: 550, maxMarks: 599, minRank: 501, maxRank: 750, category: 'PWD' },
    { minMarks: 500, maxMarks: 549, minRank: 751, maxRank: 1100, category: 'PWD' },
    { minMarks: 450, maxMarks: 499, minRank: 1101, maxRank: 1600, category: 'PWD' },
    { minMarks: 400, maxMarks: 449, minRank: 1601, maxRank: 2300, category: 'PWD' },
    { minMarks: 350, maxMarks: 399, minRank: 2301, maxRank: 3300, category: 'PWD' },
    { minMarks: 300, maxMarks: 349, minRank: 3301, maxRank: 4800, category: 'PWD' },
    { minMarks: 250, maxMarks: 299, minRank: 4801, maxRank: 6800, category: 'PWD' },
    { minMarks: 200, maxMarks: 249, minRank: 6801, maxRank: 9500, category: 'PWD' }
];

// Function to get eligible colleges based on rank and category
const getEligibleColleges = (minRank, maxRank, category) => {
    const eligibleColleges = [];
    
    nimcetColleges.forEach(college => {
        const cutoff = college.cutoffs[category];
        if (cutoff) {
            // Check if user's rank range overlaps with college cutoff
            if (minRank <= cutoff.max && maxRank >= cutoff.min) {
                const chance = calculateChance(minRank, maxRank, cutoff.min, cutoff.max);
                eligibleColleges.push({
                    ...college,
                    chance,
                    cutoffRange: `${cutoff.min} - ${cutoff.max}`,
                    userRank: `${minRank} - ${maxRank}`
                });
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

// Send OTP Route (Updated for MongoDB)
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
        
        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        
        // Find or create user
        let user = await User.findOne({ phoneNumber });
        
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
        
        res.json({
            success: true,
            message: smsResult.method === 'twilio' 
                ? 'OTP sent to your mobile number' 
                : 'OTP generated successfully',
            requiresName: !user.fullName || user.fullName === 'Pending',
            expiresIn: '10 minutes'
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
        
        // Find rank prediction
        const prediction = nimcetRankData.find(p => 
            marks >= p.minMarks && marks <= p.maxMarks && p.category === category
        );
        
        if (!prediction) {
            return res.json({
                success: false,
                message: `No prediction available for ${marks} marks in ${category} category. Please check your marks.`
            });
        }
        
        // Get eligible colleges
        const eligibleColleges = getEligibleColleges(prediction.minRank, prediction.maxRank, category);
        
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
            }
        });
        
    } catch (error) {
        console.error('Predict Rank Error:', error.message);
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

// Get user predictions history (Updated for MongoDB)
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

// Logout endpoint (Updated for MongoDB)
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
                'College Filtering System'
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
            'GET /api/admin/predictions',
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