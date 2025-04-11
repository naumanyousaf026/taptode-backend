// adminRoutes.js - For admin-only functionality
const express = require("express");
const verifyAdminToken = require("../middleware/adminAuthMiddleware");
const Contact = require("../models/Contact");
const axios = require("axios");
// const { formatWhatsAppId } = require("./whatsAppHelpers");

const router = express.Router();

// Admin endpoints for WhatsApp group operations
router.get("/groups", verifyAdminToken, async (req, res) => {
  const { uniqueId } = req.query;

  if (!uniqueId) {
    return res.status(400).json({ message: "Missing uniqueId parameter" });
  }

  try {
    // Find the contact by uniqueId to verify it exists and is connected
    const contact = await Contact.findOne({ uniqueId });
    if (!contact) {
      return res.status(404).json({ message: "WhatsApp account not found" });
    }
    
    if (contact.status !== 1) {
      return res.status(400).json({ message: "WhatsApp account is not connected" });
    }

    // Call the SMS Pro API to get groups
    const url = "https://smspro.pk/api/get/wa.groups";
    const params = {
      secret: "e7d0098a46e0af84f43c2b240af5984ae267e08d",
      unique: uniqueId
    };

    const response = await axios.get(url, { params });

    if (response.data.status !== 200) {
      return res.status(response.data.status).json({
        message: response.data.message || "Failed to fetch WhatsApp groups"
      });
    }

    return res.status(200).json({
      message: "Groups fetched successfully",
      groups: response.data.data
    });
  } catch (error) {
    console.error("Error fetching WhatsApp groups:", error.message);
    return res.status(500).json({
      message: "Failed to fetch WhatsApp groups",
      error: error.message
    });
  }
});

router.get("/group-contacts", verifyAdminToken, async (req, res) => {
  const { uniqueId, groupId } = req.query;

  if (!uniqueId || !groupId) {
    return res.status(400).json({ 
      message: "Missing required parameters: 'uniqueId' and 'groupId'" 
    });
  }

  try {
    // Verify the WhatsApp account exists and is connected
    const contact = await Contact.findOne({ uniqueId });
    if (!contact) {
      return res.status(404).json({ message: "WhatsApp account not found" });
    }
    
    if (contact.status !== 1) {
      return res.status(400).json({ message: "WhatsApp account is not connected" });
    }

    // Call the SMS Pro API to get group contacts
    const url = "https://smspro.pk/api/get/wa.group.contacts";
    const params = {
      secret: "e7d0098a46e0af84f43c2b240af5984ae267e08d",
      unique: uniqueId,
      gid: groupId
    };

    const response = await axios.get(url, { params });

    if (response.data.status !== 200) {
      return res.status(response.data.status).json({
        message: response.data.message || "Failed to fetch group contacts"
      });
    }

    // Extract phone numbers from contacts
    const phoneNumbers = response.data.data.map(contact => {
      // Get the phone number from the WhatsApp ID
      const rawId = contact.id.split('@')[0];
      return formatWhatsAppId(rawId);
    });

    return res.status(200).json({
      message: "Group contacts fetched successfully",
      groupName: response.data.data.length > 0 ? response.data.data[0].groupName : "",
      contacts: response.data.data,
      phoneNumbers
    });
  } catch (error) {
    console.error("Error fetching group contacts:", error.message);
    return res.status(500).json({
      message: "Failed to fetch group contacts",
      error: error.message
    });
  }
});

router.get("/all-group-contacts", verifyAdminToken, async (req, res) => {
  const { uniqueId } = req.query;

  if (!uniqueId) {
    return res.status(400).json({ message: "Missing uniqueId parameter" });
  }

  try {
    // Verify the WhatsApp account exists and is connected
    const contact = await Contact.findOne({ uniqueId });
    if (!contact) {
      return res.status(404).json({ message: "WhatsApp account not found" });
    }
    
    if (contact.status !== 1) {
      return res.status(400).json({ message: "WhatsApp account is not connected" });
    }

    // First get all groups
    const groupsUrl = "https://smspro.pk/api/get/wa.groups";
    const groupsParams = {
      secret: "e7d0098a46e0af84f43c2b240af5984ae267e08d",
      unique: uniqueId
    };

    const groupsResponse = await axios.get(groupsUrl, { params: groupsParams });

    if (groupsResponse.data.status !== 200 || !groupsResponse.data.data) {
      return res.status(groupsResponse.data.status || 400).json({
        message: groupsResponse.data.message || "Failed to fetch WhatsApp groups"
      });
    }

    const groups = groupsResponse.data.data;
    const allGroupContacts = [];

    // For each group, get contacts
    for (const group of groups) {
      const contactsUrl = "https://smspro.pk/api/get/wa.group.contacts";
      const contactsParams = {
        secret: "e7d0098a46e0af84f43c2b240af5984ae267e08d",
        unique: uniqueId,
        gid: group.id
      };

      const contactsResponse = await axios.get(contactsUrl, { params: contactsParams });
      
      if (contactsResponse.data.status === 200 && contactsResponse.data.data) {
        const groupContacts = contactsResponse.data.data.map(contact => {
          const rawId = contact.id.split('@')[0];
          return {
            phoneNumber: formatWhatsAppId(rawId),
            name: contact.name,
            groupId: group.id,
            groupName: group.name
          };
        });
        
        allGroupContacts.push(...groupContacts);
      }
    }

    return res.status(200).json({
      message: "All group contacts fetched successfully",
      totalContacts: allGroupContacts.length,
      contacts: allGroupContacts
    });
  } catch (error) {
    console.error("Error fetching all group contacts:", error.message);
    return res.status(500).json({
      message: "Failed to fetch all group contacts",
      error: error.message
    });
  }
});

module.exports = router;