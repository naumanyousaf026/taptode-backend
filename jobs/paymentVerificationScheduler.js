const cron = require('node-cron');
const PaymentVerificationService = require('../services/PaymentVerificationService');

// Schedule payment verification checks every 10 minutes
// Format: minute hour day-of-month month day-of-week
const schedulePaymentVerification = () => {
  cron.schedule('*/1 * * * *', async () => {
    try {
      console.log('Running scheduled payment verification check...');
      const result = await PaymentVerificationService.processAllPaymentUpdates();
      console.log('Payment verification completed:', {
        notificationsProcessed: result.notificationsProcessed,
        smsProcessed: result.smsProcessed
      });
    } catch (error) {
      console.error('Error in scheduled payment verification:', error);
    }
  });
  
  console.log('Payment verification scheduler initialized');
};

module.exports = {
  schedulePaymentVerification
};