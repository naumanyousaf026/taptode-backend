const express = require('express');
const router = express.Router();
const axios = require('axios');
const Contact = require('../models/Contact'); // Adjust path as needed
const WhatsappGroup = require('../models/WhatsappGroup');
// Environment variables (consider using dotenv)
const API_SECRET = "e7d0098a46e0af84f43c2b240af5984ae267e08d";

// Fetch WhatsApp groups for a connected user
router.get('/groups', async (req, res) => {
  try {
    // Get the most recently connected contact
    const lastConnectedContact = await Contact.findOne({ 
      status: 1 // Status 1 means connected
    }).sort({ connectedAt: -1 });
    
    if (!lastConnectedContact) {
      return res.status(404).json({ error: "No connected WhatsApp account found" });
    }
    
    // Use the unique ID from the last connected contact
    const uniqueId = lastConnectedContact.uniqueId;
    
    // Make API call to fetch WhatsApp groups
    const url = "https://smspro.pk/api/get/wa.groups";
    const response = await axios.get(url, {
      params: {
        secret: API_SECRET,
        unique: uniqueId
      }
    });
    
    // Return the groups data
    res.json({
      success: true,
      contact: {
        id: lastConnectedContact._id,
        whatsappId: lastConnectedContact.whatsappId,
        uniqueId: lastConnectedContact.uniqueId
      },
      groups: response.data
    });
    
  } catch (error) {
    console.error("Error fetching WhatsApp groups:", error);
    res.status(500).json({ 
      error: "Failed to fetch WhatsApp groups", 
      message: error.response ? error.response.data : error.message 
    });
  }
});

// Fetch contacts from a specific WhatsApp group
router.get('/group/:groupId/contacts', async (req, res) => {
  try {
    const { groupId } = req.params;
    
    // Get the most recently connected contact
    const lastConnectedContact = await Contact.findOne({ 
      status: 1 // Status 1 means connected
    }).sort({ connectedAt: -1 });
    
    if (!lastConnectedContact) {
      return res.status(404).json({ error: "No connected WhatsApp account found" });
    }
    
    // Use the unique ID from the last connected contact
    const uniqueId = lastConnectedContact.uniqueId;
    
    // Make API call to fetch contacts from the specified group
    const url = "https://smspro.pk/api/get/wa.group.contacts";
    const response = await axios.get(url, {
      params: {
        secret: API_SECRET,
        unique: uniqueId,
        gid: groupId
      }
    });
    
    // Return the contacts data
    res.json({
      success: true,
      groupId,
      contacts: response.data
    });
    
  } catch (error) {
    console.error("Error fetching group contacts:", error);
    res.status(500).json({ 
      error: "Failed to fetch group contacts", 
      message: error.response ? error.response.data : error.message 
    });
  }
});

module.exports = router;