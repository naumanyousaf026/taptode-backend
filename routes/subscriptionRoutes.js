const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Subscription = require("../models/Subscription");
const Package = require("../models/Package");

// Import middlewares
const {verifyToken} = require("../middleware/authMiddleware");
const verifyAdminToken = require("../middleware/adminAuthMiddleware");

// Subscribe to a package - FIXED IMPLEMENTATION
router.post("/subscribe", verifyToken, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { packageId } = req.body;
    const userId = req.user.userId;

    // Check if package exists
    const selectedPackage = await Package.findById(packageId).session(session);
    if (!selectedPackage) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Package not found" });
    }

    // Check for existing subscription
    const existingSubscription = await Subscription.findOne({
      userId,
      status: 'active'
    }).session(session);

    if (existingSubscription) {
      await session.abortTransaction();
      return res.status(400).json({
        message: "You already have an active subscription"
      });
    }

    // Calculate expiry date
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + selectedPackage.validityDays);

    // Create new subscription
    const newSubscription = new Subscription({
      userId,
      packageId,
      packageExpiry: expiryDate
    });

    await newSubscription.save({ session });
    await session.commitTransaction();
    await newSubscription.populate('packageId');

    res.status(201).json({
      message: "Subscription purchased successfully",
      subscription: {
        packageName: newSubscription.packageId.name,
        packageExpiry: newSubscription.packageExpiry
      }
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({
      message: "Subscription failed",
      error: error.message
    });
  } finally {
    session.endSession();
  }
});

// Get current user's subscription
router.get("/my-subscription", verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const subscription = await Subscription.findOne({
      userId,
      status: 'active'
    }).populate('packageId');

    if (!subscription) {
      return res.status(404).json({
        message: "No active subscription found"
      });
    }

    res.json({
      package: {
        name: subscription.packageId.name,
        price: subscription.packageId.price,
        validityDays: subscription.packageId.validityDays
      },
      purchaseDate: subscription.purchaseDate,
      expiryDate: subscription.packageExpiry
    });
  } catch (error) {
    res.status(500).json({
      message: "Error fetching subscription",
      error: error.message
    });
  }
});

// Admin route to view all subscriptions
router.get("/all-subscriptions", verifyAdminToken, async (req, res) => {
  try {
    const subscriptions = await Subscription.find()
      .populate('userId', 'name email')
      .populate('packageId', 'name price validityDays');

    res.json({
      success: true,
      subscriptions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching subscriptions",
      error: error.message
    });
  }
});

module.exports = router;