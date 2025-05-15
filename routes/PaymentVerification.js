const express = require("express");
const router = express.Router();
const PaymentVerificationService = require("../services/PaymentVerificationService");
const { verifyToken } = require("../middleware/authMiddleware");
const verifyAdminToken = require("../middleware/adminAuthMiddleware");

// Route to manually check for new payment SMS/notifications
router.post("/check-payments", verifyAdminToken, async (req, res) => {
  try {
    const result = await PaymentVerificationService.processAllPaymentUpdates();
    
    res.status(200).json({
      success: true,
      message: "Payment verification check completed",
      data: {
        notificationsProcessed: result.notificationsProcessed,
        smsProcessed: result.smsProcessed
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
});

// Route for admin to manually verify a payment
router.post("/verify-payment", verifyAdminToken, async (req, res) => {
  try {
    const { subscriptionId, notes } = req.body;
    const adminId = req.user.id;

    if (!subscriptionId) {
      return res.status(400).json({
        success: false,
        message: "Subscription ID is required"
      });
    }

    const result = await PaymentVerificationService.manualVerifyPayment(
      subscriptionId,
      adminId,
      notes || ""
    );

    if (result.success) {
      res.status(200).json({
        success: true,
        message: result.message
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
});

// Route for users to check their payment status
router.get("/payment-status/:subscriptionId", verifyToken, async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const userId = req.user.id;

    const Subscription = require("../models/Subscription");
    const subscription = await Subscription.findOne({
      _id: subscriptionId,
      userId
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found"
      });
    }

    res.status(200).json({
      success: true,
      data: {
        paymentStatus: subscription.paymentStatus,
        isVerified: subscription.paymentVerified,
        verificationMethod: subscription.paymentVerificationMethod,
        isActive: subscription.isActive,
        adminVerified: subscription.adminVerified
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
});

module.exports = router;