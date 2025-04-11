const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const { sendOTPViaEmail } = require("../utils/otpService"); // Import OTP service
require("dotenv").config();

const router = express.Router();
let otpStore = {}; // Temporarily store OTPs (Consider using Redis or a database in production)

// Generate 4-digit OTP
function generateOTP() {
  return Math.floor(1000 + Math.random() * 9000); // 4-digit OTP
}

// Register Route
router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  // Allow signup only for the specific admin email
  if (email !== "naumanyousaf026@gmail.com") {
    return res.status(403).json({ message: "Access denied" });
  }

  // Check if name, email, and password are provided
  if (!name || !email || !password) {
    return res
      .status(400)
      .json({ message: "Name, email, and password are required" });
  }

  try {
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const newAdmin = new Admin({ name, email, password: hashedPassword });

    await newAdmin.save();

    res.status(201).json({
      message: "Admin registered successfully",
      admin: { id: newAdmin._id, name: newAdmin.name, email: newAdmin.email },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Login Route
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  // Allow login only for the specific admin email
  if (email !== "naumanyousaf026@gmail.com") {
    return res.status(403).json({ message: "Access denied" });
  }

  // Check if email and password are provided
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    res.json({
      token,
      admin: { 
        id: admin._id, 
        name: admin.name, 
        email: admin.email,
        role: 'admin' // Explicitly include role in response
      }
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Reset Password Route
router.post("/resetpassword", async (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) {
    return res
      .status(400)
      .json({ message: "Email and new password are required" });
  }

  try {
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(400).json({ message: "Admin not found" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    admin.password = hashedPassword;
    await admin.save();

    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Password reset error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Send OTP Route
router.post("/sendotp", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  try {
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(400).json({ message: "Admin not found" });
    }

    const otp = generateOTP();
    otpStore[email] = otp; // Store OTP temporarily, associate with the email

    await sendOTPViaEmail(email, otp);

    res.status(200).json({ message: "OTP sent to your email" });
  } catch (error) {
    console.error("Error sending OTP:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Verify OTP Route
router.post("/verifyotp", async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: "Email and OTP are required" });
  }

  try {
    const storedOtp = otpStore[email];

    if (!storedOtp) {
      return res.status(400).json({ message: "OTP has expired or not sent" });
    }

    if (parseInt(otp, 10) !== storedOtp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    delete otpStore[email]; // Clear OTP after successful verification
    res.status(200).json({ message: "OTP verified successfully" });
  } catch (error) {
    console.error("OTP verification error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});
router.get("/fetch-groups/:userId", async (req, res) => {
  try {
      const { userId } = req.params;
      const user = await User.findOne({ userId }).populate("package");

      if (!user || !user.package) {
          return res.status(403).json({ message: "User does not have an active package" });
      }

      // Only allow fetching numbers for the highest package
      if (!user.package.fetchFromGroups) {
          return res.status(403).json({ message: "Your package does not allow fetching group contacts" });
      }

      const response = await axios.get("https://smspro.pk/api/get/wa.groups", {
          params: { secret: "e7d0098a46e0af84f43c2b240af5984ae267e08d", unique: "174298486345c48cce2e2d7fbdea1afc51c7c6ad2667e3d69fd6b8a" },
      });

      res.json(response.data);
  } catch (error) {
      res.status(500).json({ message: "Error fetching groups", error: error.message });
  }
});

module.exports = router;