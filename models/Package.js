const mongoose = require("mongoose");
const packageSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  price: { type: Number, required: true },
  validityDays: { type: Number, required: true },
  maxNumbers: { type: Number, required: true }, // Limit of numbers user can use
  fetchFromGroups: { type: Boolean, default: false }, // If true, numbers will be fetched from groups
});

module.exports = mongoose.model("Package", packageSchema);