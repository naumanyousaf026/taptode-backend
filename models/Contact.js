const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema({
  whatsappId: { type: String },
  uniqueId: { type: String, unique: true },
  rewarded: { type: Boolean, default: false },             // First reward flag
  rewarded24h: { type: Boolean, default: false },          // 24-hour reward flag ✅
  balance: { type: Number, default: 0 },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  lastRewardedAt: { type: Date, default: null },
  status: { type: Number, enum: [0, 1, 2], default: 0 },    // 0: default, 1: connected, 2: disconnected
  connectedAt: { type: Date, default: null },
});

module.exports = mongoose.model("Contact", contactSchema);
