const express = require("express");
const router = express.Router();
const Package = require("../models/Package");
const Subscription = require("../models/Subscription");
const User = require("../models/User");
const verifyAdminToken = require("../middleware/adminAuthMiddleware");
const { verifyToken } = require("../middleware/authMiddleware");
const WhatsappGroup = require("../models/WhatsappGroup");
const axios = require("axios");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const pdf = require("pdf-parse");

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, "../uploads");
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const fileFilter = (req, file, cb) => {
  // Accept excel and pdf files only
  if (
    file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.mimetype === "application/vnd.ms-excel" ||
    file.mimetype === "application/pdf"
  ) {
    cb(null, true);
  } else {
    cb(new Error("Only Excel and PDF files are allowed"), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max file size
});

// Environment variables
const API_SECRET = "e7d0098a46e0af84f43c2b240af5984ae267e08d";

// Route to purchase a package
router.post("/purchase-package", verifyToken, async (req, res) => {
  try {
    const { packageId, paymentDetails } = req.body;
    const userId = req.user.id;

    // Find the package
    const packageData = await Package.findById(packageId);
    if (!packageData) {
      return res.status(404).json({
        success: false,
        message: "Package not found"
      });
    }

    // Validate payment details (add your payment gateway integration here)
    // This is a placeholder for your actual payment processing logic
    const paymentResult = await processPayment(paymentDetails);

    // Calculate end date based on package validity
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + packageData.validityDays);

    // Create subscription with pending status initially
    const subscription = new Subscription({
      userId,
      packageId,
      packageType: packageData.packageType || parseInt(packageData.name.replace(/[^0-9]/g, "")) || 1,
      startDate,
      endDate,
      paymentId: paymentResult.paymentId,
      // Even if payment is successful, status remains pending until admin approval
      paymentStatus: "pending",
      adminVerified: false,
      isActive: false
    });

    await subscription.save();

    res.status(201).json({
      success: true,
      message: "Package purchased successfully. Payment is pending admin verification.",
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

// ADMIN ROUTE: Approve payment and activate subscription
router.post("/verify-payment", verifyAdminToken, async (req, res) => {
  try {
    const { subscriptionId, approvalStatus } = req.body;
    const adminId = req.user.id;

    // Find the subscription
    const subscription = await Subscription.findById(subscriptionId);
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found"
      });
    }

    // Update payment status based on admin approval
    if (approvalStatus === true) {
      subscription.paymentStatus = "completed";
      subscription.adminVerified = true;
      subscription.adminVerifiedDate = new Date();
      subscription.adminVerifiedBy = adminId;
      subscription.isActive = true;
    } else {
      subscription.paymentStatus = "failed";
      subscription.adminVerified = false;
      subscription.isActive = false;
    }

    await subscription.save();

    res.status(200).json({
      success: true,
      message: approvalStatus ? "Payment verified and subscription activated" : "Payment rejected",
      data: subscription
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
});

// Route to upload WhatsApp numbers list file
router.post("/upload-numbers", verifyToken, upload.single("file"), async (req, res) => {
  try {
    const { subscriptionId } = req.body;
    const userId = req.user.id;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded"
      });
    }

    // Find subscription
    const subscription = await Subscription.findOne({ _id: subscriptionId, userId }).populate("packageId");
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found"
      });
    }

    // Verify subscription is active
    if (!subscription.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your subscription is not active. Payment must be verified by admin first."
      });
    }

    // Extract numbers from the uploaded file
    let numbers = [];
    const filePath = file.path;
    const fileType = path.extname(file.originalname).toLowerCase();

    if (fileType === '.xlsx' || fileType === '.xls') {
      // Process Excel file
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);
      
      // Extract phone numbers from the first column (assuming it contains phone numbers)
      numbers = data.map(row => {
        const firstValue = Object.values(row)[0].toString();
        return firstValue.replace(/[^0-9+]/g, ''); // Clean up to get only numbers and + sign
      }).filter(num => num);
    } else if (fileType === '.pdf') {
      // Process PDF file
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdf(dataBuffer);
      
      // Extract numbers using regex (this is a simple approach, might need refinement)
      const phoneRegex = /(\+\d{1,3})?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
      const matches = pdfData.text.match(phoneRegex);
      if (matches) {
        numbers = matches.map(num => num.replace(/[^0-9+]/g, ''));
      }
    }

    // Validate number of extracted numbers against package limit
    const packageLimit = subscription.packageId.maxNumbers;
    if (numbers.length > packageLimit) {
      return res.status(400).json({
        success: false,
        message: `This package allows a maximum of ${packageLimit} numbers. Your file contains ${numbers.length} numbers.`
      });
    }

    // Update subscription with extracted numbers
    subscription.userProvidedNumbers = numbers;
    subscription.numberListFile = {
      fileName: file.originalname,
      fileType: fileType === '.pdf' ? 'pdf' : 'excel',
      uploadDate: new Date()
    };
    await subscription.save();

    // Clean up file if desired
    fs.unlinkSync(filePath);

    res.status(200).json({
      success: true,
      message: `WhatsApp numbers uploaded successfully. Extracted ${numbers.length} numbers.`,
      data: {
        numbersCount: numbers.length,
        fileName: file.originalname
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
});

// Route to assign system numbers to package 3 subscription
router.post("/assign-system-numbers", verifyToken, async (req, res) => {
  try {
    const { subscriptionId } = req.body;
    const userId = req.user.id;

    // Find subscription
    const subscription = await Subscription.findOne({ _id: subscriptionId, userId }).populate("packageId");
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found"
      });
    }

    // Verify subscription is active
    if (!subscription.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your subscription is not active. Payment must be verified by admin first."
      });
    }

    // Verify it's a package 3 subscription
    if (subscription.packageType !== 3) {
      return res.status(403).json({
        success: false,
        message: "Only Package 3 subscribers can access system numbers"
      });
    }

    // Fetch system numbers
    const systemNumbers = await fetchAvailableNumbers();
    
    // Assign a group if available
    const group = await findAvailableGroup();
    
    // Update subscription
    subscription.systemProvidedNumbers = systemNumbers;
    subscription.useSystemNumbers = true;
    if (group) {
      subscription.assignedGroupId = group._id;
    }
    
    await subscription.save();

    res.status(200).json({
      success: true,
      message: "System numbers assigned successfully",
      data: {
        numbersCount: systemNumbers.length,
        assignedGroupId: subscription.assignedGroupId
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

// Route to get all active subscriptions for a user
router.get("/my-subscriptions", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const subscriptions = await Subscription.find({ 
      userId, 
      endDate: { $gte: new Date() } // All subscriptions (active and pending)
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

// Route to get subscription details including numbers
router.get("/subscription/:subscriptionId", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { subscriptionId } = req.params;
    
    // Find the subscription
    const subscription = await Subscription.findOne({
      _id: subscriptionId,
      userId,
      endDate: { $gte: new Date() }
    }).populate("packageId");
    
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found"
      });
    }
    
    // Prepare the response based on subscription status
    const responseData = {
      subscription,
      isActive: subscription.isActive,
      paymentStatus: subscription.paymentStatus,
      adminVerified: subscription.adminVerified,
      packageType: subscription.packageType,
      canUploadNumbers: subscription.isActive, // All active subscriptions can upload numbers
      canUseSystemNumbers: subscription.isActive && subscription.packageType === 3, // Only package 3
      userProvidedNumbersCount: subscription.userProvidedNumbers.length,
      systemProvidedNumbersCount: subscription.systemProvidedNumbers.length,
      numberListFile: subscription.numberListFile
    };
    
    res.status(200).json({
      success: true,
      message: "Subscription details retrieved successfully",
      data: responseData
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
});

// ADMIN ROUTE: Get all pending subscriptions
router.get("/admin/pending-subscriptions", verifyAdminToken, async (req, res) => {
  try {
    const pendingSubscriptions = await Subscription.find({
      paymentStatus: "pending",
      adminVerified: false
    }).populate("userId packageId");

    res.status(200).json({
      success: true,
      count: pendingSubscriptions.length,
      data: pendingSubscriptions
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
    
    // For demonstration, we're simulating a payment based on the presence of paymentDetails
    if (!paymentDetails || !paymentDetails.amount) {
      return {
        success: false,
        paymentId: null,
        error: "Invalid payment details"
      };
    }
    
    // Simulate successful payment
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

// Function to find an available WhatsApp group to assign to a subscription
async function findAvailableGroup() {
  try {
    // This is a placeholder - you'll need to implement your own logic
    // to find and assign groups to users
    return await WhatsappGroup.findOne({});
  } catch (error) {
    console.error("Error finding available group:", error);
    return null;
  }
}

module.exports = router;