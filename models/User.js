const mongoose = require("mongoose");
const AutoIncrement = require("mongoose-sequence")(mongoose);

const userSchema = new mongoose.Schema({
  userId: { type: Number, unique: true }, // Auto-incremented field
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  referralLink: {
    type: String,
    unique: true,
    validate: {
      validator: (value) => value.length === 5,
    },
  },
  Rewards: { type: Number, default: 0 },
  Balance: { type: Number, default: 0 },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Self-reference
  resetOtp: { type: String },
  otpExpires: { type: Date },
    // **Package Details**
    package: { type: mongoose.Schema.Types.ObjectId, ref: "Package" },  // Reference to Package model
    packageExpiry: { type: Date },  // Expiry date of the package
  
});

// Auto-increment plugin for userId
userSchema.plugin(AutoIncrement, { inc_field: "userId", start_seq: 1301 });

module.exports = mongoose.model("User", userSchema);
