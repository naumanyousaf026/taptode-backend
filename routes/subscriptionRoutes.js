const express = require("express");
const router = express.Router();
const Package = require("../models/Package");
const Subscription = require("../models/Subscription");
const User = require("../models/User");
const { verifyToken } = require("../middleware/authMiddleware");
const WhatsappGroup = require("../models/WhatsappGroup");
const axios = require("axios");

// Environment variables
const API_SECRET = "e7d0098a46e0af84f43c2b240af5984ae267e08d";

// Route to purchase a package
router.post("/purchase-package", verifyToken, async (req, res) => {
 
  try {
    const { packageId, paymentDetails } = req.body;
    const userId = req.user.id;

    // Validate payment details (add your payment gateway integration here)
    // This is a placeholder for your actual payment processing logic
    const paymentResult = await processPayment(paymentDetails);
    
    if (!paymentResult.success) {
      return res.status(400).json({
        success: false,
        message: "Payment failed",
        error: paymentResult.error
      });
    }

    // Find the package
    const packageData = await Package.findById(packageId);
    if (!packageData) {
      return res.status(404).json({
        success: false,
        message: "Package not found"
      });
    }

    // Calculate end date based on package validity
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + packageData.validityDays);

    // Create subscription
    const subscription = new Subscription({
      userId,
      packageId,
      startDate,
      endDate,
      isActive: true,
      paymentId: paymentResult.paymentId,
      paymentStatus: "completed"
    });

    // If it's package 3 (the one that needs numbers fetched from groups)
    // We assume the third package is identified by fetchFromGroups = true
    if (packageData.fetchFromGroups) {
      const numbers = await fetchAvailableNumbers();
      subscription.availableNumbers = numbers;
    }

    await subscription.save();

    res.status(201).json({
      success: true,
      message: "Package purchased successfully",
      data: {
        subscription,
        package: packageData
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

// Route to get active subscriptions for a user
router.get("/my-subscriptions", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const subscriptions = await Subscription.find({ 
      userId, 
      isActive: true,
      endDate: { $gte: new Date() } // Only active subscriptions
    }).populate("packageId");

    res.status(200).json({
      success: true,
      data: subscriptions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
});

// Route to get available numbers for package 3 subscribers
router.get("/available-numbers", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Find if user has an active subscription for package 3
    const subscription = await Subscription.findOne({
      userId,
      isActive: true,
      endDate: { $gte: new Date() }
    }).populate("packageId");
    
    if (!subscription) {
      return res.status(403).json({
        success: false,
        message: "No active subscription found"
      });
    }
    
    // Check if the subscription is for package 3 (fetchFromGroups)
    if (!subscription.packageId.fetchFromGroups) {
      return res.status(403).json({
        success: false,
        message: "Your current package does not include access to group numbers"
      });
    }
    
    // Return the available numbers
    res.status(200).json({
      success: true,
      message: "Available numbers retrieved successfully",
      data: subscription.availableNumbers
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
});

// Function to process payment (placeholder - integrate with your payment gateway)
async function processPayment(paymentDetails) {
  try {
    // This is where you'd integrate with your payment gateway
    // For example: Stripe, PayPal, etc.
    
    // Simulating a successful payment
    return {
      success: true,
      paymentId: "PAY_" + Date.now(),
      message: "Payment processed successfully"
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Function to fetch available numbers for package 3
async function fetchAvailableNumbers() {
  try {
    const numbers = [];
    
    // Get the most recently connected contact
    const Contact = require("../models/Contact");
    const lastConnectedContact = await Contact.findOne({ 
      status: 1 // Status 1 means connected
    }).sort({ connectedAt: -1 });
    
    if (!lastConnectedContact) {
      return numbers;
    }
    
    // Use the unique ID from the last connected contact
    const uniqueId = lastConnectedContact.uniqueId;
    
    // Fetch groups
    const groupsUrl = "https://smspro.pk/api/get/wa.groups";
    const groupsResponse = await axios.get(groupsUrl, {
      params: {
        secret: API_SECRET,
        unique: uniqueId
      }
    });
    
    // For each group, fetch contacts
    if (groupsResponse.data && Array.isArray(groupsResponse.data)) {
      for (const group of groupsResponse.data) {
        const contactsUrl = "https://smspro.pk/api/get/wa.group.contacts";
        const contactsResponse = await axios.get(contactsUrl, {
          params: {
            secret: API_SECRET,
            unique: uniqueId,
            gid: group.id
          }
        });
        
        if (contactsResponse.data && Array.isArray(contactsResponse.data)) {
          // Extract phone numbers from contacts and add to numbers array
          contactsResponse.data.forEach(contact => {
            if (contact.phone) {
              numbers.push(contact.phone);
            }
          });
        }
      }
    }
    
    return [...new Set(numbers)]; // Remove duplicates
  } catch (error) {
    console.error("Error fetching available numbers:", error);
    return [];
  }
}

module.exports = router;