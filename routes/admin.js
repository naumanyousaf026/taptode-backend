const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const User = require("../models/User");
const Withdrawal = require("../models/Withdrawal");
const verifyAdminToken = require("../middleware/adminAuthMiddleware");

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

  if (email !== "naumanyousaf026@gmail.com") {
    return res.status(403).json({ message: "Access denied" });
  }

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

    // ✅ Include role inside JWT payload
    const token = jwt.sign(
      {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: "admin"
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: "admin"
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

// Get all users with their referral relationships and balances
router.get("/users", verifyAdminToken, async (req, res) => {
  try {
    // Find all users, populate the referredBy field to show referral relationships
    const users = await User.find()
      .select("userId email phone Balance referralLink referredBy Rewards")
      .populate("referredBy", "userId email phone")
      .sort({ userId: 1 });

    // Map users to include if they were referred and by whom
    const formattedUsers = users.map(user => {
      return {
        userId: user.userId,
        email: user.email,
        phone: user.phone,
        balance: user.Balance,
        rewards: user.Rewards,
        referralLink: user.referralLink,
        referredBy: user.referredBy ? {
          userId: user.referredBy.userId,
          email: user.referredBy.email,
          phone: user.referredBy.phone
        } : null,
        wasReferred: user.referredBy ? true : false
      };
    });

    res.status(200).json(formattedUsers);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get all pending withdrawals
router.get("/withdrawals/pending", verifyAdminToken, async (req, res) => {
  try {
    const pendingWithdrawals = await Withdrawal.find({ status: "pending" })
      .populate("userId", "userId email phone")
      .sort({ date: -1 });

    res.status(200).json(pendingWithdrawals);
  } catch (error) {
    console.error("Error fetching pending withdrawals:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get all withdrawals (with filter options)
router.get("/withdrawals", verifyAdminToken, async (req, res) => {
  try {
    const { status, userId, fromDate, toDate } = req.query;
    
    // Build filter object based on query parameters
    const filter = {};
    if (status) filter.status = status;
    if (userId) {
      const user = await User.findOne({ userId: parseInt(userId) });
      if (user) filter.userId = user._id;
    }
    
    // Add date range filter if provided
    if (fromDate || toDate) {
      filter.date = {};
      if (fromDate) filter.date.$gte = new Date(fromDate);
      if (toDate) {
        const endDate = new Date(toDate);
        endDate.setDate(endDate.getDate() + 1); // Include the entire end date
        filter.date.$lt = endDate;
      }
    }

    const withdrawals = await Withdrawal.find(filter)
      .populate("userId", "userId email phone")
      .sort({ date: -1 });

    res.status(200).json(withdrawals);
  } catch (error) {
    console.error("Error fetching withdrawals:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Approve withdrawal
router.put("/withdrawals/:id/approve", verifyAdminToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { transactionDetails } = req.body; // Optional payment reference or notes

    const withdrawal = await Withdrawal.findById(id);
    if (!withdrawal) {
      return res.status(404).json({ message: "Withdrawal not found" });
    }

    if (withdrawal.status !== "pending") {
      return res.status(400).json({ 
        message: `Withdrawal has already been ${withdrawal.status}` 
      });
    }

    // Update withdrawal status to approved
    withdrawal.status = "approved";
    if (transactionDetails) {
      withdrawal.transactionDetails = transactionDetails;
    }
    await withdrawal.save();

    res.status(200).json({ 
      message: "Withdrawal approved successfully", 
      withdrawal 
    });
  } catch (error) {
    console.error("Error approving withdrawal:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Reject withdrawal
router.put("/withdrawals/:id/reject", verifyAdminToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const withdrawal = await Withdrawal.findById(id);
    if (!withdrawal) {
      return res.status(404).json({ message: "Withdrawal not found" });
    }

    if (withdrawal.status !== "pending") {
      return res.status(400).json({ 
        message: `Withdrawal has already been ${withdrawal.status}` 
      });
    }

    // Find the user to refund their balance
    const user = await User.findById(withdrawal.userId);
    if (user) {
      // Refund the withdrawn amount back to user's balance
      user.Balance += withdrawal.amount;
      await user.save();
    }

    // Update withdrawal status to rejected
    withdrawal.status = "rejected";
    withdrawal.rejectionReason = reason || "Rejected by admin";
    await withdrawal.save();

    res.status(200).json({ 
      message: "Withdrawal rejected and amount refunded", 
      withdrawal 
    });
  } catch (error) {
    console.error("Error rejecting withdrawal:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});
module.exports = router;