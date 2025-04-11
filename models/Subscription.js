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
  purchaseDate: { 
    type: Date, 
    default: Date.now 
  },
  packageExpiry: { 
    type: Date, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['active', 'expired'], 
    default: 'active' 
  }
}, { 
  timestamps: true 
});

// Add a method to check if subscription is active
subscriptionSchema.methods.isActive = function() {
  return this.status === 'active' && this.packageExpiry > new Date();
};

module.exports = mongoose.model("Subscription", subscriptionSchema);