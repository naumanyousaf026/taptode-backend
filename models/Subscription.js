const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  packageId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Package", 
    required: true 
  },
  startDate: { 
    type: Date, 
    default: Date.now 
  },
  endDate: { 
    type: Date, 
    required: true 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  paymentId: { 
    type: String, 
    required: true 
  },
  paymentStatus: { 
    type: String, 
    enum: ["pending", "completed", "failed"],
    default: "pending"
  },
  // For package 3 users - will store the list of available numbers
  availableNumbers: {
    type: [String],
    default: []
  }
}, { timestamps: true });

module.exports = mongoose.model("Subscription", subscriptionSchema);