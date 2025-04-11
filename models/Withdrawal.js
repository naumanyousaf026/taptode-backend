const mongoose = require("mongoose");

// Define the Withdrawal Schema
const withdrawalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Reference to User model
  name: { type: String },
  phone: { type: String, required: true },
  amount: { type: Number, required: true },
  bankAccount: { type: String },
  paymentMethod: { type: String },
  status: { type: String, default: "pending" }, // Default status is 'pending'
  date: { type: Date, default: Date.now }, // Auto-set current date
});

// Create the model from the schema
const Withdrawal = mongoose.model("Withdrawal", withdrawalSchema);

module.exports = Withdrawal;
