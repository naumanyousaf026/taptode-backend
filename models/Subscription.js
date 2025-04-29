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
  packageType: {
    type: Number,  // 1, 2, or 3 to easily identify which package was purchased
    required: true,
    enum: [1, 2, 3]
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
    default: false  // Changed to false by default until payment is completed
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
  // For users to submit their own numbers (for all packages)
  userProvidedNumbers: {
    type: [String],
    default: []
  },
  // For package 3 users - will store the list of available numbers from our system
  systemProvidedNumbers: {
    type: [String],
    default: []
  },
  // Reference to the group provided for package 3 users
  assignedGroupId: {
    type: String,
    default: null
  },
  // To track whether user needs to provide numbers or use system numbers
  useSystemNumbers: {
    type: Boolean,
    default: false
  },
  // Track the uploaded file information
  numberListFile: {
    fileName: String,
    fileType: {
      type: String,
      enum: ["excel", "pdf", null],
      default: null
    },
    uploadDate: Date
  },
  // Admin approval tracking
  adminVerified: {
    type: Boolean,
    default: false
  },
  adminVerifiedDate: Date,
  adminVerifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  }
}, { timestamps: true });

// Middleware to update isActive based on payment status and admin verification
subscriptionSchema.pre('save', function(next) {
  if (this.paymentStatus === 'completed' && this.adminVerified === true) {
    this.isActive = true;
  } else {
    this.isActive = false;
  }
  next();
});

// Method to check if user has privileges to upload their own list
subscriptionSchema.methods.canUploadOwnList = function() {
  return this.isActive && [1, 2, 3].includes(this.packageType);
};

// Method to check if user has privileges to access system-provided numbers
subscriptionSchema.methods.canUseSystemNumbers = function() {
  return this.isActive && this.packageType === 3;
};

module.exports = mongoose.model("Subscription", subscriptionSchema);