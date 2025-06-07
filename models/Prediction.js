const mongoose = require('mongoose');

const predictionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    userDetails: {
        fullName: String,
        phoneNumber: String
    },
    marks: {
        type: Number,
        required: [true, 'Marks are required'],
        min: [0, 'Marks cannot be negative'],
        max: [1000, 'Marks cannot exceed 1000']
    },
    category: {
        type: String,
        required: [true, 'Category is required'],
        enum: ['General', 'OBC', 'SC', 'ST', 'PWD']
    },
    predictedMinRank: {
        type: Number,
        required: true
    },
    predictedMaxRank: {
        type: Number,
        required: true
    },
    eligibleColleges: {
        type: Number,
        default: 0
    },
    additionalInfo: {
        percentage: Number,
        percentile: Number,
        candidatesAhead: Number,
        candidatesBehind: Number
    }
}, {
    timestamps: true
});

// Index for faster queries
predictionSchema.index({ userId: 1 });
predictionSchema.index({ category: 1 });
predictionSchema.index({ marks: -1 });
predictionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Prediction', predictionSchema);