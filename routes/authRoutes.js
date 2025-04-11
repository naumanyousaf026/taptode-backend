const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const User = require("../models/User");
const Withdrawal = require("../models/Withdrawal");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const axios = require("axios"); // Make sure to include axios for API calls
const router = express.Router();

// Function to format phone number
const formatPhoneNumber = (phone) => {
  // Ensure the phone number starts with +92
  if (!phone.startsWith("+92")) {
    return `+92${phone.replace(/^\+/, "")}`; // Remove any existing '+' and prepend +92
  }
  return phone;
};

// router.post("/register", async (req, res) => {
//   const { email, phone, password, referredBy } = req.body;
//   const formattedPhone = formatPhoneNumber(phone);
//   const hashedPassword = await bcrypt.hash(password, 10);

//   const referralLink = uuidv4(); // Generate a unique referral link

//   const newUser = new User({
//     email,
//     phone: formattedPhone,
//     password: hashedPassword,
//     referralLink,
//     Rewards: 10, // Initial reward for first-time registration
//     referredBy: referredBy || null, // Optional referral
//   });

//   try {
//     // Save the new user
//     await newUser.save();

//     // If referred by someone, reward the referrer
//     if (referredBy) {
//       const referrer = await User.findById(referredBy);
//       if (referrer) {
//         referrer.Rewards += 100; // Add 100 rupees reward to referrer
//         referrer.Balance += 100; // Update referrer's balance
//         await referrer.save();
//       }
//     }

//     res.status(201).json({
//       message: "User registered successfully",
//       referralLink,
//     });
//   } catch (error) {
//     res.status(400).json({ error: error.message });
//   }
// });

// Utility to generate a unique referral code
const generateReferralCode = async () => {
  let code;
  let isUnique = false;

  while (!isUnique) {
    code = Math.floor(10000 + Math.random() * 90000).toString(); // Generate a 5-digit number
    const existingUser = await User.findOne({ referralLink: code });
    if (!existingUser) {
      isUnique = true; // Ensure the code is unique
    }
  }

  return code;
};

// User registration route
router.post("/register", async (req, res) => {
  const { email, phone, password, referredBy } = req.body;

  try {
    const formattedPhone = formatPhoneNumber(phone); // Add your own phone number formatting logic
    const hashedPassword = await bcrypt.hash(password, 10);

    const referralLink = await generateReferralCode();

    const newUser = new User({
      email,
      phone: formattedPhone,
      password: hashedPassword,
      referralLink,
      Rewards: 10,
      Balance: 10,
    });

    if (referredBy) {
      const referrer = await User.findOne({ referralLink: referredBy });
      if (referrer) {
        newUser.referredBy = referrer._id;
        referrer.Rewards += 100;
        referrer.Balance += 100;
        await referrer.save();
      } else {
        return res.status(400).json({ message: "Invalid referral code" });
      }
    }

    await newUser.save();
    res.status(201).json({
      message: "User registered successfully",
      referralLink,
    });
  } catch (error) {
    res
      .status(400)
      .json({ message: "Error registering user", error: error.message });
  }
});

// Login
router.post("/login", async (req, res) => {
  const { phone, password } = req.body;
  const formattedPhone = formatPhoneNumber(phone);
  const user = await User.findOne({ phone: formattedPhone });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: "Invalid credentials" });
  }
// When storing the token

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
  
  res.json({ token });
});

router.get("/referral-link", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id); // Fetch user from DB
    if (!user || !user.referralLink) {
      return res
        .status(400)
        .json({ error: "Referral code not found for the user." });
    }
    const referralUrl = `http://localhost:3000/register?ref=${user.referralLink}`;
    res.json({ referralLink: referralUrl });
  } catch (error) {
    res.status(500).json({ error: "Internal server error." });
  }
});

// Logout
router.post("/logout", (req, res) => {
  res.json({ message: "Logged out successfully" });
});

// Change Password Route
router.post("/change-password", verifyToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  try {
    // Retrieve the user ID from the middleware
    const userId = req.user.id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).send({ error: "User not found" });

    // Validate the current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).send({ error: "Current password is incorrect" });
    }

    // Hash the new password and update the user record
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.status(200).send({ message: "Password changed successfully" });
  } catch (err) {
    console.error(err); // Log the error to the console for debugging
    res.status(500).send({ error: "Internal server error" });
  }
});

// Change Password Endpoint
router.post("/reset-password", async (req, res) => {
  const { phone, newPassword } = req.body; // Get phone and new password from request
  const formattedPhone = formatPhoneNumber(phone); // Format the phone number

  try {
    const user = await User.findOne({ phone: formattedPhone });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: "Password changed successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.post("/forgot-password", async (req, res) => {
  const { phone } = req.body;
  const formattedPhone = formatPhoneNumber(phone);

  try {
    const user = await User.findOne({ phone: formattedPhone });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    user.resetOtp = otp;
    user.otpExpires = Date.now() + 5 * 60 * 1000; // OTP expires in 5 minutes
    await user.save();

    // Send OTP via SMS
    const params = {
      secret: "e7d0098a46e0af84f43c2b240af5984ae267e08d",
      type: "sms",
      mode: "devices",
      device: "e6138de1-be1b-2ff1-8685-380463973378",
      sim: 1,
      phone: formattedPhone,
      message: `Your OTP is ${otp}`,
    };

    const otpResponse = await axios.get("https://smspro.pk/api/send/otp", {
      params,
    });

    if (otpResponse.data.status === 200) {
      res.json({ message: "OTP sent successfully" });
    } else {
      res.status(400).json({ message: "Failed to send OTP via SMS" });
    }
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Verify OTP
router.post("/verify-otp", async (req, res) => {
  const { phone, otp } = req.body;
  const formattedPhone = formatPhoneNumber(phone);

  try {
    const user = await User.findOne({ phone: formattedPhone });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if OTP is valid
    if (user.resetOtp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (Date.now() > user.otpExpires) {
      return res.status(400).json({ message: "OTP has expired" });
    }

    // OTP is valid
    res.json({ message: "OTP verified successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});
// Middleware to authenticate and decode JWT
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1]; // Extract token from Authorization header

  if (!token) {
    return res
      .status(401)
      .json({ message: "Access denied. No token provided." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // Verify the token
    req.user = decoded; // Attach decoded user data to the request object
    next();
  } catch (err) {
    res.status(403).json({ message: "Invalid token." });
  }
};

router.get("/current-user", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "phone userId referralLink Rewards"
    ); // Select only the required fields
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});
router.get('/verify', verifyToken, (req, res) => {
  res.status(200).json({ valid: true });
});
// router.get("/generate-whatsapp-qr", async (req, res) => {
//   const { secret, sid } = req.query;

//   if (!secret || !sid) {
//     return res.status(400).json({
//       message: "Missing required query parameters: 'secret' and 'sid'.",
//     });
//   }

//   const url = "https://smspro.pk/api/create/wa.link";
//   const params = { secret, sid };
//   const maxRetries = 3;
//   let attempt = 0;

//   while (attempt < maxRetries) {
//     try {
//       const response = await axios.get(url, { params });

//       if (response.data.status === 200) {
//         return res.status(200).json({
//           message: "WhatsApp QRCode has been created!",
//           qrImageLink: response.data.data.qrimagelink,
//           infoLink: response.data.data.infolink,
//         });
//       } else {
//         return res.status(400).json({
//           message: `Error generating QR code: ${
//             response.data.message || "Unknown error"
//           }`,
//         });
//       }
//     } catch (error) {
//       console.error(`Attempt ${attempt + 1}:`, error.message);
//       attempt++;

//       if (attempt >= maxRetries) {
//         return res.status(503).json({
//           message:
//             "WhatsApp server is temporarily unavailable. Please try again later.",
//         });
//       }

//       // Wait 2 seconds before retrying
//       await new Promise((resolve) => setTimeout(resolve, 2000));
//     }
//   }
// });

module.exports = router;
