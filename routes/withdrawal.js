const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const mongoose = require("mongoose");
const Withdrawal = require("../models/Withdrawal");
const User = require("../models/User");

const formatPhoneNumber = (phone) => {
  if (!phone.startsWith("+92")) {
    return `+92${phone.replace(/^\+/, "")}`;
  }
  return phone;
};

// POST: Create a new withdrawal
router.post("/withdrawals", verifyToken, async (req, res) => {
  try {
    const { name, phone, bankAccount, paymentMethod } = req.body;
    let { amount } = req.body;

    const userId = req.user?.id; // Ensure userId is extracted from the token
    if (!userId) {
      return res
        .status(401)
        .json({ message: "Unauthorized: User ID missing." });
    }

    // Validate phone number format
    const formattedPhone = formatPhoneNumber(phone);

    // Step 1: Verify user existence and balance
    const user = await User.findOne({ phone: formattedPhone });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Initialize withdrawal count if not present
    if (!user.withdrawalCount) user.withdrawalCount = 0;

    // Determine the maximum withdrawal amount for the current count
    const withdrawalRules = [
      100,
      user.Balance > 2200 ? 2200 : null,
      user.Balance > 11000 ? 11000 : null,
      user.Balance > 55000 ? 55000 : null,
    ];
    const maxWithdrawal = withdrawalRules[user.withdrawalCount] || null;

    if (!maxWithdrawal || amount > maxWithdrawal) {
      return res.status(400).json({
        message: `Maximum withdrawal for this attempt is ${maxWithdrawal}.`,
      });
    }

    if (user.Balance < amount) {
      return res.status(400).json({ message: "Insufficient balance." });
    }

    // Step 2: Process the withdrawal
    const withdrawal = new Withdrawal({
      name,
      phone: formattedPhone,
      amount,
      bankAccount,
      paymentMethod,
      userId,
      status: "pending",
    });

    // Step 3: Deduct amount from user balance and increment withdrawal count
    user.Balance -= amount;
    user.withdrawalCount += 1;
    await user.save();

    // Step 4: Save the withdrawal request
    await withdrawal.save();

    res.status(201).json({
      message: "Withdrawal request submitted successfully.",
      withdrawal,
      balanceAfterDeduction: user.Balance,
    });
  } catch (error) {
    console.error("Error processing withdrawal request:", error.message);
    res.status(500).json({ message: "Error processing withdrawal request." });
  }
});

// GET: Fetch user's withdrawal records
router.get("/withdrawals", verifyToken, async (req, res) => {
  try {
    const userId = req.user?.id;

    // Validate user ID presence and format
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid or missing user ID." });
    }

    // Fetch and sort withdrawals (latest first)
    const withdrawals = await Withdrawal.find({ userId }).sort({ date: -1 });
    res.status(200).json(withdrawals);
  } catch (error) {
    console.error("Error fetching withdrawal records:", error.message);
    res.status(500).json({ message: "Error fetching withdrawal records." });
  }
});

router.post("/withdraw", verifyToken, async (req, res) => {
  const { amount } = req.body;

  // Validate input
  if (!amount || amount <= 0) {
    return res
      .status(400)
      .json({ error: "Invalid amount. Amount must be greater than 0." });
  }

  try {
    // Find the logged-in user
    const user = await User.findById(req.user.id);
    // console.log(user);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    // Check if the user has sufficient balance
    if (amount > user.Balance) {
      return res.status(400).json({ error: "Insufficient funds." });
    }

    // Deduct the amount from the user's balance
    user.Balance -= amount;
    await user.save();

    // Create a new withdrawal record
    const withdrawal = new Withdrawal({
      userId: user._id,
      phone: user.phone,
      amount,
    });
    await withdrawal.save();

    // Simulate sending SMS (can integrate with a real SMS gateway)
    // console.log(
    //   `SMS sent to ${user.phone}: Withdrawal of Rs ${amount} is successful.`
    // );

    res.status(200).json({
      message: "Withdrawal successful.",
      withdrawal: {
        id: withdrawal._id,
        amount: withdrawal.amount,
        date: withdrawal.date,
      },
      remainingBalance: user.Balance,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;
