const axios = require("axios");
const FormData = require("form-data");
const Subscription = require("../models/Subscription");
const User = require("../models/User");

// API Secret for authentication
const API_SECRET = "e7d0098a46e0af84f43c2b240af5984ae267e08d";
const WHATSAPP_ACCOUNT = "174757536345c48cce2e2d7fbdea1afc51c7c6ad266829e2434393e";

// Payment method constants
const PAYMENT_METHODS = {
  EASYPAISA: "easypaisa",
  JAZZCASH: "jazzcash",
  RAAST: "raast"
};

// Valid payment sources
const VALID_SOURCES = {
  EASYPAISA_NUMBERS: ["3737"],
  EASYPAISA_SENDERS: ["easypaisa"],
  JAZZCASH_NUMBERS: ["8558"],
  JAZZCASH_SENDERS: ["jazzcsh", "jcash", "mobilink"],
  RAAST_SENDERS: ["raast", "sbp", "hbl", "ubl", "meezan"]
};

// Cache for already processed transactions to avoid duplicates
const PROCESSED_TRANSACTIONS = new Set();
// Cache expiration time (24 hours)
const CACHE_EXPIRATION = 24 * 60 * 60 * 1000;

class PaymentVerificationService {
  /**
   * Process all payment notifications and SMS
   * @returns {Promise<Object>} Result of processing      
   */
  static async processAllPaymentUpdates() {
    try {
      console.log("Starting payment updates processing...");
      
      // Get all notifications and SMS in parallel
      const [notifications, smsMessages] = await Promise.all([
        this.fetchNotifications(),
        this.fetchSmsMessages()
      ]);
      
      // Filter notifications from valid sources
      const validNotifications = this.filterValidPaymentSources(notifications);
      
      // Filter SMS from valid sources
      const validSms = this.filterValidSmsPaymentSources(smsMessages);
      
      // Process notifications and SMS messages in parallel for performance
      const [notificationResults, smsResults] = await Promise.all([
        this.processNotifications(validNotifications),
        this.processSmsMessages(validSms)
      ]);
      
      console.log("Payment updates processing completed.");
      
      // Clean up expired entries from transaction cache
      this.cleanupProcessedTransactions();
      
      return {
        success: true,
        message: "Payment updates processed successfully",
        notificationsProcessed: notificationResults.processed,
        smsProcessed: smsResults.processed
      };
    } catch (error) {
      console.error("Error processing payment updates:", error);
      return {
        success: false,
        message: "Error processing payment updates: " + error.message,
        notificationsProcessed: 0,
        smsProcessed: 0
      };
    }
  }

  /**
   * Clean up expired entries from the transaction cache
   */
  static cleanupProcessedTransactions() {
    const now = Date.now();
    // Get all entries from the cache that have timestamps
    const entries = Array.from(PROCESSED_TRANSACTIONS.entries());
    
    // Filter out expired entries
    entries.forEach(([txId, timestamp]) => {
      if (now - timestamp > CACHE_EXPIRATION) {
        PROCESSED_TRANSACTIONS.delete(txId);
      }
    });
  }

  /**
   * Filter notifications to only include valid payment sources
   * @param {Array} notifications All notifications
   * @returns {Array} Filtered notifications from valid sources
   */
  static filterValidPaymentSources(notifications) {
    if (!notifications || !Array.isArray(notifications)) {
      return [];
    }
    
    return notifications.filter(notification => {
      if (!notification || (!notification.message && !notification.content)) {
        return false;
      }
      
      // Use either message or content field
      const message = (notification.message || notification.content || "").toLowerCase();
      const sender = (notification.sender || notification.title || "").toLowerCase();
      
      // Check for EasyPaisa keywords
      const isEasypaisa = message.includes("easypaisa") || 
                          message.includes("tpesa") || 
                          VALID_SOURCES.EASYPAISA_NUMBERS.some(num => sender === num) ||
                          VALID_SOURCES.EASYPAISA_SENDERS.some(s => sender === s);
      
      // Check for JazzCash keywords
      const isJazzCash = message.includes("jazzcash") || 
                         message.includes("jcash") ||
                         message.includes("mobilink") ||
                         VALID_SOURCES.JAZZCASH_NUMBERS.some(num => sender === num) ||
                         VALID_SOURCES.JAZZCASH_SENDERS.some(s => sender === s);
      
      // Check for Raast keywords
      const isRaast = message.includes("raast") ||
                      VALID_SOURCES.RAAST_SENDERS.some(s => 
                        message.includes(s) || sender === s);
      
      // Check for general payment keywords
      const hasPaymentKeywords = message.includes("payment") || 
                                message.includes("received") || 
                                message.includes("transaction") || 
                                message.includes("transfer") ||
                                message.includes("rec") ||
                                message.includes("amount");
      
      return isEasypaisa || isJazzCash || isRaast || hasPaymentKeywords;
    });
  }

  /**
   * Filter SMS messages to only include valid payment sources
   * @param {Array} smsMessages All SMS messages
   * @returns {Array} Filtered SMS messages from valid sources
   */
  static filterValidSmsPaymentSources(smsMessages) {
    if (!smsMessages || !Array.isArray(smsMessages)) {
      return [];
    }
    
    return smsMessages.filter(sms => {
      if (!sms || (!sms.text && !sms.message && !sms.content)) {
        return false;
      }
      
      // Use text, message or content field
      const text = (sms.text || sms.message || sms.content || "").toLowerCase();
      const sender = (sms.sender || sms.from || sms.title || "").toLowerCase();
      
      // Check for EasyPaisa sources
      const isEasypaisa = text.includes("easypaisa") || 
                          text.includes("tpesa") ||
                          VALID_SOURCES.EASYPAISA_NUMBERS.includes(sender) ||
                          VALID_SOURCES.EASYPAISA_SENDERS.some(s => sender === s);
      
      // Check for JazzCash sources
      const isJazzCash = text.includes("jazzcash") || 
                         text.includes("jcash") ||
                         text.includes("mobilink") ||
                         VALID_SOURCES.JAZZCASH_NUMBERS.includes(sender) ||
                         VALID_SOURCES.JAZZCASH_SENDERS.some(s => sender === s);
      
      // Check for Raast sources
      const isRaast = text.includes("raast") ||
                      VALID_SOURCES.RAAST_SENDERS.some(s => 
                        text.includes(s) || sender === s);
      
      // Check for general payment keywords
      const hasPaymentKeywords = text.includes("payment") || 
                                text.includes("received") || 
                                text.includes("transaction") || 
                                text.includes("transfer") ||
                                text.includes("rec") ||
                                text.includes("amount");
      
      return isEasypaisa || isJazzCash || isRaast || hasPaymentKeywords;
    });
  }

  /**
   * Fetch notifications from API
   * @returns {Promise<Array>} Notifications
   */
  static async fetchNotifications() {
    try {
      const response = await axios.get("https://smspro.pk/api/get/notifications", {
        params: { secret: API_SECRET },
        timeout: 10000 // 10 second timeout
      });
      
      // Extract notifications from the response.data.data array
      let notifications = [];
      if (response.data && response.data.data && Array.isArray(response.data.data)) {
        notifications = response.data.data;
      } else if (Array.isArray(response.data)) {
        notifications = response.data;
      } else if (response.data && typeof response.data === 'object') {
        // Try to find an array anywhere in the response
        const possibleArrays = Object.values(response.data).filter(val => Array.isArray(val));
        if (possibleArrays.length > 0) {
          // Use the largest array (most likely the notifications)
          notifications = possibleArrays.reduce((a, b) => a.length > b.length ? a : b, []);
        }
      }
      
      // Parse and process each notification to extract payment details
      const processedNotifications = notifications.map(notif => {
        // Ensure we have at least the content as message
        return {
          id: notif.id || Math.random().toString(36).substring(7),
          message: notif.content || notif.message || "",
          sender: notif.title || notif.sender || "",
          timestamp: notif.timestamp || new Date().toISOString(),
          isRead: notif.isRead || false
        };
      }).filter(n => n.message); // Filter out empty messages
      
      return processedNotifications;
    } catch (error) {
      // console.error("Error in fetchNotifications:", error);
      return [];
    }
  }

  /**
   * Fetch SMS messages from API
   * @returns {Promise<Array>} SMS messages
   */
  static async fetchSmsMessages() {
    try {
      const response = await axios.get("https://smspro.pk/api/get/sms.received", {
        params: { secret: API_SECRET },
        timeout: 10000 // 10 second timeout
      });
      
      // Extract SMS messages from the response.data.data array
      let smsMessages = [];
      if (response.data && response.data.data && Array.isArray(response.data.data)) {
        smsMessages = response.data.data;
      } else if (Array.isArray(response.data)) {
        smsMessages = response.data;
      } else if (response.data && typeof response.data === 'object') {
        // Try to find an array anywhere in the response
        const possibleArrays = Object.values(response.data).filter(val => Array.isArray(val));
        if (possibleArrays.length > 0) {
          // Use the largest array (most likely the SMS messages)
          smsMessages = possibleArrays.reduce((a, b) => a.length > b.length ? a : b, []);
        }
      }
      
      // Parse and process each SMS to extract payment details
      const processedSmsMessages = smsMessages.map(sms => {
        // Ensure we have at least the message text
        return {
          id: sms.id || Math.random().toString(36).substring(7),
          text: sms.message || sms.content || sms.text || "",
          sender: sms.sender || sms.from || sms.title || "",
          timestamp: sms.timestamp || new Date().toISOString(),
          isRead: sms.isRead || false
        };
      }).filter(s => s.text); // Filter out empty texts
      
      return processedSmsMessages;
    } catch (error) {
      // console.error("Error in fetchSmsMessages:", error);
      return [];
    }
  }

  /**
   * Process notifications
   * @param {Array} notifications Notifications to process
   * @returns {Promise<Object>} Result of processing
   */
  static async processNotifications(notifications) {
    let processed = 0;
    
    if (!notifications || notifications.length === 0) {
      return { processed };
    }
    
    // Process each notification sequentially for better stability
    for (const notification of notifications) {
      try {
        // Extract payment details
        const paymentDetails = this.extractPaymentDetailsFromNotification(notification);
        
        if (paymentDetails) {
          // Skip already processed transactions
          if (paymentDetails.transactionId && 
              PROCESSED_TRANSACTIONS.has(paymentDetails.transactionId)) {
            continue;
          }
          
          // Verify payment
          const verified = await this.verifyPaymentWithSubscription(paymentDetails);
          
          // Mark as processed if verified
          if (verified && paymentDetails.transactionId) {
            PROCESSED_TRANSACTIONS.set(paymentDetails.transactionId, Date.now());
            processed++;
          }
        }
      } catch (error) {
        console.error("Error processing notification:", error);
      }
    }
    
    return { processed };
  }

  /**
   * Process SMS messages
   * @param {Array} smsMessages SMS messages to process
   * @returns {Promise<Object>} Result of processing
   */
  static async processSmsMessages(smsMessages) {
    let processed = 0;
    
    if (!smsMessages || smsMessages.length === 0) {
      return { processed };
    }
    
    // Process each SMS sequentially for better stability
    for (const sms of smsMessages) {
      try {
        // Extract payment details
        const paymentDetails = this.extractPaymentDetailsFromSms(sms);
        
        if (paymentDetails) {
          // Skip already processed transactions
          if (paymentDetails.transactionId && 
              PROCESSED_TRANSACTIONS.has(paymentDetails.transactionId)) {
            continue;
          }
          
          // Verify payment
          const verified = await this.verifyPaymentWithSubscription(paymentDetails);
          
          // Mark as processed if verified
          if (verified && paymentDetails.transactionId) {
            PROCESSED_TRANSACTIONS.set(paymentDetails.transactionId, Date.now());
            processed++;
          }
        }
      } catch (error) {
        console.error("Error processing SMS:", error);
      }
    }
    
    return { processed };
  }

  /**
   * Extract payment details from notification
   * @param {Object} notification Notification to extract details from
   * @returns {Object|null} Payment details or null if not found
   */
  static extractPaymentDetailsFromNotification(notification) {
    if (!notification || (!notification.message && !notification.content)) {
      return null;
    }
    
    // Use message or content field
    const message = notification.message || notification.content || "";
    
    // Determine payment method based on notification
    let method = null;
    const messageLower = message.toLowerCase();
    const sender = (notification.sender || notification.title || "").toLowerCase();
    
    if (messageLower.includes("easypaisa") || 
        VALID_SOURCES.EASYPAISA_SENDERS.some(s => sender === s) ||
        VALID_SOURCES.EASYPAISA_NUMBERS.includes(sender)) {
      method = PAYMENT_METHODS.EASYPAISA;
    } else if (messageLower.includes("jazzcash") || 
               messageLower.includes("jcash") ||
               VALID_SOURCES.JAZZCASH_SENDERS.some(s => sender === s) ||
               VALID_SOURCES.JAZZCASH_NUMBERS.includes(sender)) {
      method = PAYMENT_METHODS.JAZZCASH;
    } else if (messageLower.includes("raast") ||
               VALID_SOURCES.RAAST_SENDERS.some(s => messageLower.includes(s) || sender === s)) {
      method = PAYMENT_METHODS.RAAST;
    }
    
    // Extract payment details with the determined method
    return this.extractPaymentDetails(
      message, 
      notification.timestamp || new Date(),
      method
    );
  }

  /**
   * Extract payment details from SMS
   * @param {Object} sms SMS to extract details from
   * @returns {Object|null} Payment details or null if not found
   */
  static extractPaymentDetailsFromSms(sms) {
    if (!sms || (!sms.text && !sms.message && !sms.content)) {
      return null;
    }
    
    // Use text, message or content field
    const text = sms.text || sms.message || sms.content || "";
    
    // Determine payment method based on SMS
    let method = null;
    const textLower = text.toLowerCase();
    const sender = (sms.sender || sms.from || sms.title || "").toLowerCase();
    
    if (textLower.includes("easypaisa") || 
        VALID_SOURCES.EASYPAISA_SENDERS.some(s => sender === s) ||
        VALID_SOURCES.EASYPAISA_NUMBERS.includes(sender)) {
      method = PAYMENT_METHODS.EASYPAISA;
    } else if (textLower.includes("jazzcash") || 
               textLower.includes("jcash") ||
               VALID_SOURCES.JAZZCASH_SENDERS.some(s => sender === s) ||
               VALID_SOURCES.JAZZCASH_NUMBERS.includes(sender)) {
      method = PAYMENT_METHODS.JAZZCASH;
    } else if (textLower.includes("raast") ||
               VALID_SOURCES.RAAST_SENDERS.some(s => textLower.includes(s) || sender === s)) {
      method = PAYMENT_METHODS.RAAST;
    }
    
    // Extract payment details with the determined method
    return this.extractPaymentDetails(
      text, 
      sms.timestamp || new Date(),
      method
    );
  }

  /**
   * Extract payment details from text
   * @param {String} text Text to extract details from
   * @param {Date} timestamp Timestamp of message
   * @param {String} method Payment method if known
   * @returns {Object|null} Payment details or null if not found
   */
  static extractPaymentDetails(text, timestamp, method = null) {
    if (!text) {
      return null;
    }
    
    const paymentDetails = {
      timestamp: timestamp || new Date(),
      method: method,
      accountTitle: null,
      accountNumber: null,
      transactionId: null,
      amount: null,
      senderInfo: null
    };
    
    // Determine payment method if not provided
    if (!paymentDetails.method) {
      if (text.toLowerCase().includes("easypaisa")) {
        paymentDetails.method = PAYMENT_METHODS.EASYPAISA;
      } else if (text.toLowerCase().includes("jazzcash")) {
        paymentDetails.method = PAYMENT_METHODS.JAZZCASH;
      } else if (text.toLowerCase().includes("raast")) {
        paymentDetails.method = PAYMENT_METHODS.RAAST;
      }
    }
    
    // Extract transaction ID - For example "Trx ID 36620983731"
    const transactionIdRegex = /(?:TRX\s?ID|TID|Transaction\s+ID|TRX|TR|EP|JC|RT)[\s:#]*(\d+)/i;
    const transactionIdMatch = text.match(transactionIdRegex);
    if (transactionIdMatch) {
      paymentDetails.transactionId = transactionIdMatch[1];
    } else {
      // Secondary attempt for transaction ID in different format
      const secondaryTrxRegex = /\b([A-Z][A-Z0-9]{5,})\b/;
      const secondaryMatch = text.match(secondaryTrxRegex);
      if (secondaryMatch) {
        paymentDetails.transactionId = secondaryMatch[1];
      } else {
        // Last attempt - look for any sequence of 8+ digits that could be a transaction ID
        const lastAttemptRegex = /\b(\d{8,})\b/;
        const lastMatch = text.match(lastAttemptRegex);
        if (lastMatch) {
          paymentDetails.transactionId = lastMatch[1];
        }
      }
    }
    
    // Extract amount - For example "Rs 10.00"
    const amountRegex = /Rs\.?\s*([\d,]+\.?\d*)|\bPKR\s*([\d,]+\.?\d*)|\bamount\s*(?:of|:)?\s*(?:Rs\.?|PKR)?\s*([\d,]+\.?\d*)|payment\s*(?:of)?\s*(?:Rs\.?|PKR)?\s*([\d,]+\.?\d*)|received\s*(?:Rs\.?|PKR)?\s*([\d,]+\.?\d*)|transferred\s*(?:Rs\.?|PKR)?\s*([\d,]+\.?\d*)|rec\w*\s*(?:Rs\.?|PKR)?\s*([\d,]+\.?\d*)/i;
    const amountMatch = text.match(amountRegex);
    if (amountMatch) {
      const amountStr = (amountMatch[1] || amountMatch[2] || amountMatch[3] || amountMatch[4] || amountMatch[5] || amountMatch[6] || amountMatch[7] || "").replace(/,/g, "");
      paymentDetails.amount = parseFloat(amountStr);
    } else {
      // Try to find any number that could be an amount (3+ digits)
      const numberRegex = /\b(\d{2,4})\b/;
      const numberMatch = text.match(numberRegex);
      if (numberMatch) {
        paymentDetails.amount = parseFloat(numberMatch[1]);
      }
    }
    
    // Extract sender information - For example "from AMBREEN FATIMA"
    const senderRegex = /from\s+([A-Za-z\s]+)(?:\s+with|\s+to|\s+at|\s+on|$)/i;
    const senderMatch = text.match(senderRegex);
    if (senderMatch) {
      paymentDetails.senderInfo = senderMatch[1].trim();
    }
    
    // Extract account number (last 4 digits) or phone number
    const phoneNumberRegex = /(?:account|mobile|number|no|#)\s*(?:\d*\**)?(\d{2,4})(?:\b|\.|$)/i;
    const phoneMatch = text.match(phoneNumberRegex);
    if (phoneMatch) {
      paymentDetails.accountNumber = phoneMatch[1];
    } else {
      // Try to find any masked phone number pattern
      const maskedPhoneRegex = /\b\d{2,6}\*{2,}\d{2,4}\b/;
      const maskedMatch = text.match(maskedPhoneRegex);
      if (maskedMatch) {
        // Extract the last few digits from the masked number
        const lastDigitsRegex = /\*+(\d{2,4})\b/;
        const lastDigitsMatch = maskedMatch[0].match(lastDigitsRegex);
        if (lastDigitsMatch) {
          paymentDetails.accountNumber = lastDigitsMatch[1];
        }
      } else {
        // Try to find any 4-digit number that could be account digits
        const numbersRegex = /\b(\d{4})\b/g;
        const allMatches = [...text.matchAll(numbersRegex)];
        if (allMatches.length > 0) {
          // Use the last occurrence of 4 digits as it's often the account number
          paymentDetails.accountNumber = allMatches[allMatches.length - 1][1];
        }
      }
    }
    
    // If at least transaction ID or amount is present, consider the extraction partially successful
    if (paymentDetails.transactionId || paymentDetails.amount) {
      return paymentDetails;
    }
    
    return null;
  }

  /**
   * Send WhatsApp message using the provided API
   * @param {Object} params Message parameters
   * @param {String} params.phone Phone number to send message to
   * @param {String} params.packageName Package name
   * @param {String} params.expiryDate Expiry date of subscription
   * @param {String} params.status Status of subscription (success/failed/pending)
   * @param {String} params.reason Reason for rejection (if status is failed)
   * @returns {Promise<Object>} Result of sending WhatsApp message
   */
  static async sendWhatsAppMessage(params) {
    try {
      const { phone, packageName, expiryDate, status, reason } = params;
      let message = '';
      
      if (status === 'success') {
        message = `✅ *SUBSCRIPTION ACTIVATED*\n\nYour subscription for the *"${packageName}"* package has been *successfully activated*.\n\n*Expiry Date:* ${expiryDate}`;
      } else if (status === 'failed') {
        message = `❌ *SUBSCRIPTION REJECTED*\n\nYour subscription request was *rejected*.\n\n*Reason:* ${reason || 'Payment verification failed'}`;
      } else {
        message = `⚠️ *SUBSCRIPTION PENDING*\n\nYour subscription status is *pending*. Please contact support.`;
      }
  
 
      const url = "https://smspro.pk/api/send/whatsapp";
      const formData = new FormData();
      
      // API credentials
      formData.append('secret', API_SECRET);
      formData.append('account', WHATSAPP_ACCOUNT);
      formData.append('recipient', phone); // Format: +923XXXXXXXXX
      formData.append('type', 'text');
      formData.append('message', message);
      
      const response = await axios.post(url, formData, { 
        headers: formData.getHeaders() 
      });
      
      // console.log("WhatsApp message sent successfully:", response.data);
      return {
        success: true,
        response: response.data
      };
    } catch (error) {
      // console.error("Error sending WhatsApp message:", error);
      return {
        success: false,
        error: error.message
      };
    }
  }
/**
 * Verify payment with subscription
 * @param {Object} paymentDetails Payment details
 * @returns {Promise<Boolean>} True if verified
 */
static async verifyPaymentWithSubscription(paymentDetails) {
  try {
    if (!paymentDetails || !paymentDetails.transactionId) {
      return false;
    }

    // First, check if this transaction ID has been used in any previous subscription
    const existingSubscription = await Subscription.findOne({
      "paymentDetails.transactionId": paymentDetails.transactionId,
      paymentStatus: { $in: ["completed", "verified"] }
    });

    // Find the current pending subscription with this transaction ID
    const subscription = await Subscription.findOne({
      "paymentDetails.transactionId": paymentDetails.transactionId,
      paymentStatus: "pending"
    }).populate("userId").populate("packageId");

    if (!subscription) {
      // console.log("No pending subscription found for transaction ID:", paymentDetails.transactionId);
      return false;
    }

    const user = subscription.userId;
    if (!user) {
      // console.log("User not found for subscription:", subscription._id);
      return false;
    }

    // If this transaction ID has already been used, reject the payment
    if (existingSubscription) {
      // console.log(`Transaction ID ${paymentDetails.transactionId} has already been used in subscription: ${existingSubscription._id}`);
      
      // Update subscription status to 'failed'
      subscription.paymentStatus = "failed";
      subscription.lastVerificationAttempt = new Date();
      subscription.adminNotes = "Transaction ID already used in a previous subscription";
      await subscription.save();

      // Notify user about the duplicate transaction ID
      await this.sendWhatsAppMessage({
        phone: user.phone,
        packageName: subscription.packageName || "subscription package",
        status: "failed",
        reason: `*Duplicate Transaction ID*: The Transaction ID ${paymentDetails.transactionId} has already been used for a previous subscription. Each payment requires a unique transaction ID.`
      });

      // Notify user via SMS as well
      await this.sendSms(user.phone, 
        `Your subscription payment has been rejected. Reason: Transaction ID ${paymentDetails.transactionId} has already been used. Please make a new payment with a unique transaction ID.`);

      return false;
    }

    // Get the required package details
    const selectedPackage = subscription.packageId;
    if (!selectedPackage) {
      // console.log("Package details not found for subscription:", subscription._id);
      // Update subscription status to 'failed'
      subscription.paymentStatus = "failed";
      subscription.lastVerificationAttempt = new Date();
      await subscription.save();
      
      await this.sendPaymentFailureNotification(user, subscription, "Package details not found");
      return false;
    }

    // Check the payment amount against the selected package's price
    const expectedAmount = selectedPackage.price;
    if (!paymentDetails.amount || paymentDetails.amount < expectedAmount) {
      // console.log(`Payment amount mismatch. Expected: ${expectedAmount}, Received: ${paymentDetails.amount}`);
      
      // Update subscription status to 'failed'
      subscription.paymentStatus = "failed";
      subscription.lastVerificationAttempt = new Date();
      await subscription.save();

      // Notify user about the amount mismatch via WhatsApp
      await this.sendWhatsAppMessage({
        phone: user.phone,
        packageName: selectedPackage.name,
        status: "failed",
        reason: `Payment amount is insufficient. Required: Rs. ${expectedAmount}, Received: Rs. ${paymentDetails.amount || 0}`
      });

      // Notify user via SMS as well
      await this.sendSms(user.phone, 
        `Your payment for the ${selectedPackage.name} package has been rejected. Reason: Insufficient payment amount. Required: Rs. ${expectedAmount}, Received: Rs. ${paymentDetails.amount || 0}`);

      return false;
    }

    // If everything is verified, update subscription
    subscription.paymentStatus = "completed";
    subscription.paymentVerified = true;
    subscription.paymentVerificationMethod = "automatic";
    subscription.verificationDate = new Date();
    subscription.lastVerificationAttempt = new Date();
    subscription.isActive = true;
    
    // Update payment details with the verification result
    if (!subscription.paymentDetails) {
      subscription.paymentDetails = {};
    }
    subscription.paymentDetails = {
      ...subscription.paymentDetails,
      ...paymentDetails,
      verifiedAt: new Date()
    };
    
    await subscription.save();
    
    // Update user subscription status
    user.subscriptionStatus = "active";
    user.subscriptionExpiryDate = subscription.endDate;
    user.subscriptionPlan = subscription.packageId;
    await user.save();
    
    // Send success notification to user
    await this.sendPaymentSuccessNotification(user, subscription);
    
    return true;
  } catch (error) {
    // console.error("Error verifying payment with subscription:", error);
    return false;
  }
}
/**
 * Check if a transaction ID has already been used
 * @param {String} transactionId Transaction ID to check
 * @returns {Promise<Object>} Result with existing subscription if found
 */
static async checkDuplicateTransaction(transactionId) {
  try {
    if (!transactionId) {
      return { isDuplicate: false };
    }
    
    // Check if this transaction ID has been used in any previous subscription
    const existingSubscription = await Subscription.findOne({
      "paymentDetails.transactionId": transactionId,
      paymentStatus: { $in: ["completed", "verified"] }
    }).populate("userId", "name email phone");
    
    if (existingSubscription) {
      return {
        isDuplicate: true,
        subscription: existingSubscription
      };
    }
    
    return { isDuplicate: false };
  } catch (error) {
    console.error("Error checking duplicate transaction:", error);
    return { 
      isDuplicate: false, 
      error: error.message 
    };
  }
}
 

  /**
   * Send SMS using the provided API
   * @param {String} phoneNumber Phone number to send SMS to
   * @param {String} message Message to send
   * @returns {Promise<Object>} Result of sending SMS
   */
  static async sendSms(phoneNumber, message) {
    try {
      const response = await axios.post("https://smspro.pk/api/send/sms", {
        secret: API_SECRET,
        phone: phoneNumber,
        message: message
      });
      
      return {
        success: true,
        response: response.data
      };
    } catch (error) {
      console.error("Error sending SMS:", error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send payment success notification to user
   * @param {Object} user User object
   * @param {Object} subscription Subscription object
   * @returns {Promise<void>}
   */
  static async sendPaymentSuccessNotification(user, subscription) {
    try {
      if (!user || !user.phone) {
        // console.log("Cannot send notification: user phone missing");
        return;
      }
      
      // console.log(`Sending payment success notification to user ${user._id}`);
      
      // Get package details
      const packageName = subscription.packageName || "Subscription Package";
      const expiryDate = subscription.endDate ? 
        new Date(subscription.endDate).toLocaleDateString() : 
        "N/A";
      
      // Send notifications in parallel for better performance
      await Promise.all([
        // Send SMS notification
        this.sendSms(user.phone, "Your payment has been verified and your package has been activated."),
        
        // Send WhatsApp notification
        this.sendWhatsAppMessage({
          phone: user.phone,
          packageName: packageName,
          expiryDate: expiryDate,
          status: "success"
        })
      ]);
      
      // console.log(`Success notifications sent to ${user.phone}`);
    } catch (error) {
      // console.error("Error sending payment success notification:", error);
    }
  }

    /**
     * Send payment failure notification to user
     * @param {Object} user User object
     * @param {Object} subscription Subscription object
     * @param {String} reason Failure reason
     * @returns {Promise<void>}
     */
    static async sendPaymentFailureNotification(user, subscription, reason) {
      try {
        if (!user || !user.phone) {
          console.log("Cannot send notification: user phone missing");
          return;
        }
        
        // console.log(`Sending payment failure notification to user ${user._id}`);
        
        // Get package details
        const packageName = subscription.packageName || "Subscription Package";
        
        // Send notifications in parallel
        await Promise.all([
          // Send SMS notification
          this.sendSms(user.phone, `Your payment verification failed. Reason: ${reason}`),
          
          // Send WhatsApp notification
          this.sendWhatsAppMessage({
            phone: user.phone,
            packageName: packageName,
            status: "failed",
            reason: reason
          })
        ]);
        
        // console.log(`Failure notifications sent to ${user.phone}`);
      } catch (error) {
        // console.error("Error sending payment failure notification:", error);
      }
    }
  
    /**
     * Send incomplete payment notification to user
     * @param {Object} user User object
     * @param {Object} subscription Subscription object
     * @returns {Promise<void>}
     */
    static async sendIncompletePaymentNotification(user, subscription) {
      try {
        if (!user || !user.phone) {
          // console.log("Cannot send notification: user phone missing");
          return;
        }
        
        // console.log(`Sending incomplete payment notification to user ${user._id}`);
        
        // Get package details
        const packageName = subscription.packageName || "Subscription Package";
        
        // Send notifications in parallel
        await Promise.all([
          // Send SMS notification
          this.sendSms(user.phone, "Incomplete payment. Please send the full amount."),
          
          // Send WhatsApp notification
          this.sendWhatsAppMessage({
            phone: user.phone,
            packageName: packageName,
            status: "failed",
            reason: "Incomplete payment amount received. Please send the full amount."
          })
        ]);
        
        console.log(`Incomplete payment notifications sent to ${user.phone}`);
      } catch (error) {
        console.error("Error sending incomplete payment notification:", error);
      }
    }
  
    /**
     * Send duplicate transaction notification to user
     * @param {Object} user User object
     * @param {String} transactionId Transaction ID
     * @returns {Promise<void>}
     */
    static async sendDuplicateTransactionNotification(user, transactionId) {
      try {
        if (!user || !user.phone) {
          // console.log("Cannot send notification: user phone missing");
          return;
        }
        
        // console.log(`Sending duplicate transaction notification to user ${user._id}`);
        
        const reason = `Transaction ID ${transactionId} has already been used for a previous subscription. Please use a new transaction ID.`;
        
        // Send notifications in parallel
        await Promise.all([
          // Send SMS notification
          this.sendSms(user.phone, reason),
          
          // Send WhatsApp notification
          this.sendWhatsAppMessage({
            phone: user.phone,
            packageName: "Subscription",
            status: "failed",
            reason: reason
          })
        ]);
        
        // console.log(`Duplicate transaction notifications sent to ${user.phone}`);
      } catch (error) {
        // console.error("Error sending duplicate transaction notification:", error);
      }
    }
  
    /**
     * Manually verify payment
     * @param {String} subscriptionId Subscription ID
     * @param {String} adminId Admin ID
     * @param {String} notes Admin notes
     * @returns {Promise<Object>} Result of verification
     */
    static async manuallyVerifyPayment(subscriptionId, adminId, notes) {
      try {
        if (!subscriptionId) {
          return {
            success: false,
            message: "Subscription ID is required"
          };
        }
        
        // Find the subscription
        const subscription = await Subscription.findById(subscriptionId);
        
        if (!subscription) {
          return {
            success: false,
            message: "Subscription not found"
          };
        }
        
        // console.log(`Manual verification initiated for subscription: ${subscriptionId}`);
        
        // Update subscription
        subscription.paymentStatus = "completed";
        subscription.paymentVerified = true;
        subscription.paymentVerificationMethod = "manual";
        subscription.adminVerified = true;
        subscription.adminVerifiedBy = adminId;
        subscription.adminNotes = notes || "";
        subscription.verificationDate = new Date();
        subscription.lastVerificationAttempt = new Date();
        subscription.isActive = true; // Activate the subscription
        
        // Save subscription
        await subscription.save();
        // console.log("Payment has been manually verified and subscription status updated to COMPLETED");
        
        // Find the user to update their subscription status
        const user = await User.findById(subscription.userId);
        
        if (user) {
          // Update user subscription status based on the plan
          user.subscriptionStatus = "active";
          user.subscriptionExpiryDate = subscription.endDate;
          user.subscriptionPlan = subscription.packageId;
          
          await user.save();
          // console.log("User subscription status updated to ACTIVE");
          
          // Send success notification to user
          await this.sendPaymentSuccessNotification(user, subscription);
        }
        
        return {
          success: true,
          message: "Payment manually verified successfully",
          subscription: {
            id: subscription._id,
            plan: subscription.packageId,
            amount: subscription.paymentDetails?.amount,
            status: subscription.paymentStatus,
            expiryDate: subscription.endDate
          }
        };
      } catch (error) {
        // console.error("Error manually verifying payment:", error);
        return {
          success: false,
          message: "Error manually verifying payment: " + error.message
        };
      }
    }
    
    /**
     * Manually reject payment
     * @param {String} subscriptionId Subscription ID
     * @param {String} adminId Admin ID
     * @param {String} reason Rejection reason
     * @returns {Promise<Object>} Result of rejection
     */
    static async manuallyRejectPayment(subscriptionId, adminId, reason) {
      try {
        if (!subscriptionId) {
          return {
            success: false,
            message: "Subscription ID is required"
          };
        }
        
        // Find the subscription
        const subscription = await Subscription.findById(subscriptionId);
        
        if (!subscription) {
          return {
            success: false,
            message: "Subscription not found"
          };
        }
        
        // console.log(`Manual rejection initiated for subscription: ${subscriptionId}`);
        
        // Update subscription
        subscription.paymentStatus = "rejected";
        subscription.paymentVerified = false;
        subscription.paymentVerificationMethod = "manual";
        subscription.adminVerified = true;
        subscription.adminVerifiedBy = adminId;
        subscription.adminNotes = reason || "";
        subscription.lastVerificationAttempt = new Date();
        subscription.isActive = false;
        
        // Save subscription
        await subscription.save();
        // console.log("Payment has been manually rejected");
        
        // Find the user to notify them
        const user = await User.findById(subscription.userId);
        
        if (user) {
          // Send failure notification to user with the specific reason
          await this.sendPaymentFailureNotification(user, subscription, reason || "Payment rejected by admin");
        }
        
        return {
          success: true,
          message: "Payment manually rejected successfully",
          subscription: {
            id: subscription._id,
            plan: subscription.packageId,
            amount: subscription.paymentDetails?.amount,
            status: subscription.paymentStatus
          }
        };
      } catch (error) {
        // console.error("Error manually rejecting payment:", error);
        return {
          success: false,
          message: "Error manually rejecting payment: " + error.message
        };
      }
    }
  
    /**
     * Get pending subscriptions that need verification
     * @param {Number} limit Maximum number of subscriptions to return
     * @param {Number} skip Number of subscriptions to skip (for pagination)
     * @returns {Promise<Object>} Result with pending subscriptions
     */
    static async getPendingVerifications(limit = 20, skip = 0) {
      try {
        // Find pending subscriptions
        const pendingSubscriptions = await Subscription.find({
          paymentStatus: "pending",
          // Only include subscriptions that were created within the last 7 days
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        })
        .sort({ createdAt: -1 }) // Newest first
        .skip(skip)
        .limit(limit)
        .populate("userId", "name email phone"); // Include basic user info
        
        // Get total count for pagination
        const totalCount = await Subscription.countDocuments({
          paymentStatus: "pending",
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        });
        
        return {
          success: true,
          pendingSubscriptions,
          totalCount,
          limit,
          skip
        };
      } catch (error) {
        // console.error("Error getting pending verifications:", error);
        return {
          success: false,
          message: "Error getting pending verifications: " + error.message,
          pendingSubscriptions: [],
          totalCount: 0
        };
      }
    }
  }
  
  module.exports = PaymentVerificationService;