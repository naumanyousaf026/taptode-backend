const mongoose = require("mongoose");
const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const User = require("../models/User");
const Contact = require("../models/Contact");
const axios = require("axios");

const router = express.Router();

// Helper function
function formatWhatsAppId(wid) {
  if (!wid || typeof wid !== 'string') return null;
  const parts = wid.split(":")[0];
  return `+${parts}`;
}

// Allocate ₹10 on first connect, and another ₹10 after 24 hours
async function allocateRewards(contact, isInitial = false) {
  const now = new Date();
  const user = await User.findById(contact.userId);

  if (isInitial) {
    // Initial reward
    contact.balance += 10;
    contact.lastRewardedAt = now;
    contact.rewarded = true;

    if (user) {
      user.Balance = (user.Balance || 0) + 10;
      user.Rewards = (user.Rewards || 0) + 10;
      await user.save();
    }
    await contact.save();
    return;
  }

  // Additional ₹10 after 24 hours
  const hoursPassed = now - new Date(contact.connectedAt);
  const rewardAfter24Hours = 24 * 60 * 60 * 1000;

  if (!contact.rewarded24h && hoursPassed >= rewardAfter24Hours) {
    contact.balance += 10;
    contact.lastRewardedAt = now;
    contact.rewarded24h = true;

    if (user) {
      user.Balance = (user.Balance || 0) + 10;
      user.Rewards = (user.Rewards || 0) + 10;
      await user.save();
    }
    await contact.save();
  }
}

// Periodic fetch to reward after 24 hours
async function fetchWhatsAppAccounts() {
  const url = "https://smspro.pk/api/get/wa.accounts";
  const params = {
    secret: "e7d0098a46e0af84f43c2b240af5984ae267e08d",
    sid: 2,
    limit: 10,
    page: 1,
  };

  try {
    const response = await axios.get(url, { params });

    if (response.data && response.data.message === "WhatsApp Accounts") {
      const accounts = response.data.data;

      for (const account of accounts) {
        const { unique, status } = account;
        const contact = await Contact.findOne({ uniqueId: unique });

        if (contact) {
          if (status === "connected") {
            await allocateRewards(contact, false);
            contact.status = 1;
          } else {
            contact.status = 2;
          }
          await contact.save();
        }
      }
    }
  } catch (error) {
    console.error("Error fetching WhatsApp accounts:", error.message);
  }
}

// Call every minute
setInterval(fetchWhatsAppAccounts, 60 * 1000);

// === ROUTES ===

// Generate QR
router.get("/generate-whatsapp-qr", verifyToken, async (req, res) => {
  const { secret, sid } = req.query;

  if (!secret || !sid) {
    return res.status(400).json({ message: "Missing 'secret' or 'sid'." });
  }

  try {
    const response = await axios.get("https://smspro.pk/api/create/wa.link", { params: { secret, sid } });

    if (response.data.status === 200) {
      const qrImageLink = response.data.data.qrimagelink;
      const infoLink = response.data.data.infolink;
      const token = new URL(infoLink).searchParams.get("token");

      if (!token) {
        return res.status(400).json({ message: "Token not found in infolink." });
      }

      return res.status(200).json({ message: "QR generated.", qrImageLink, infoLink, token });
    }

    return res.status(400).json({ message: `QR error: ${response.data.message || "Unknown error"}` });
  } catch (error) {
    return res.status(500).json({ message: "QR error", error: error.message });
  }
});

// Get WhatsApp Info
router.get("/get-whatsapp-info", verifyToken, async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({ message: "Missing WhatsApp token." });

  try {
    const response = await axios.get("https://smspro.pk/api/get/wa.info", { params: { token } });
    if (response.data.status !== 200 || !response.data.data) {
      return res.status(200).json({ message: "Waiting for WhatsApp info..." });
    }

    const { wid, unique } = response.data.data;
    const whatsappId = formatWhatsAppId(wid);
    if (!whatsappId) return res.status(200).json({ message: "Failed to format WhatsApp ID." });

    let contact = await Contact.findOne({ whatsappId });
    const now = new Date();

    if (contact) {
      contact.uniqueId = unique;
      contact.status = 1;
      contact.connectedAt = now;
      await contact.save();
    } else {
      contact = new Contact({
        whatsappId,
        uniqueId: unique,
        userId: req.user.id,
        status: 1,
        connectedAt: now,
        balance: 0,
        rewarded: false,
        rewarded24h: false,
      });
      await contact.save();
      await allocateRewards(contact, true);
    }

    const user = await User.findById(req.user.id);

    return res.status(200).json({
      message: "WhatsApp info retrieved.",
      data: {
        whatsappId: contact.whatsappId,
        uniqueId: contact.uniqueId,
        reward: contact.balance || 0,
        balance: contact.balance || 0,
        userRewards: user?.Rewards || 0,
        userBalance: user?.Balance || 0,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Error getting WhatsApp info.", error: error.message });
  }
});

// Delete Account
router.delete("/delete-wa-account", verifyToken, async (req, res) => {
  const { unique } = req.query;
  if (!unique) return res.status(400).json({ message: "Missing unique ID." });

  try {
    const contact = await Contact.findOne({ uniqueId: unique });
    if (!contact) return res.status(404).json({ message: "Contact not found." });

    contact.status = 0;
    await contact.save();

    const smsProResponse = await axios.get("https://smspro.pk/api/delete/wa.account", {
      params: { secret: "e7d0098a46e0af84f43c2b240af5984ae267e08d", unique }
    });

    return res.status(200).json({ message: "Account deleted.", data: smsProResponse.data });
  } catch (error) {
    return res.status(500).json({ message: "Delete failed.", error: error.message });
  }
});

// Get Last Connected
router.get("/last-connected", verifyToken, async (req, res) => {
  try {
    const lastContact = await Contact.findOne().sort({ lastRewardedAt: -1 });
    if (!lastContact) return res.status(404).json({ message: "No connected users." });

    const statusText = lastContact.status === 1 ? "Connected" : "Disconnected";
    return res.status(200).json({
      whatsappId: lastContact.whatsappId,
      uniqueId: lastContact.uniqueId,
      status: statusText,
      balance: lastContact.balance || 0,
      lastConnectedAt: lastContact.lastRewardedAt,
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update status
router.put("/update-status", verifyToken, async (req, res) => {
  const { whatsappId, status } = req.body;
  if (!whatsappId) return res.status(400).json({ message: "WhatsApp ID is required." });

  try {
    const contact = await Contact.findOne({ whatsappId });
    if (!contact) return res.status(404).json({ message: "Contact not found." });

    contact.status = status;
    await contact.save();

    return res.status(200).json({ message: "Status updated successfully." });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error.", error });
  }
});

module.exports = router;
