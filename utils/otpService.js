const nodemailer = require("nodemailer");

async function sendOTPViaEmail(email, otp) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER, // Use environment variable for email
      pass: process.env.EMAIL_PASS, // Use environment variable for password (App Password if using Gmail)
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER, // From email address
    to: email,
    subject: "Your OTP Code",
    text: `Your OTP code is ${otp}`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("OTP sent successfully!");
  } catch (error) {
    console.error("Error sending OTP: ", error);
  }
}

module.exports = { sendOTPViaEmail };