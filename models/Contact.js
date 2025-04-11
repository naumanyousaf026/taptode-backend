const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema({
  whatsappId: { type: String},
  uniqueId: { type: String, unique: true },
  rewarded: { type: Boolean, default: false },
  balance: { type: Number, default: 0 }, // Track contact's reward balance
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  lastRewardedAt: { type: Date, default: null }, // Timestamp for recurring reward tracking
  status: { type: Number, enum: [0, 1, 2], default: 0 }, // 0: default, 1: connected, 2: disconnected
  connectedAt: { type: Date, default: null }, // New field
});

module.exports = mongoose.model("Contact", contactSchema);
