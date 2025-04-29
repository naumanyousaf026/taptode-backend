const express = require('express');
const router = express.Router();
const axios = require('axios');
const FormData = require('form-data');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const Contact = require('../models/Contact');
const WhatsappGroup = require('../models/WhatsappGroup');

const API_SECRET = "e7d0098a46e0af84f43c2b240af5984ae267e08d";

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage, limits: { fileSize: 16 * 1024 * 1024 } });

const formatPhoneNumber = number => {
  if (!number || typeof number !== 'string') return null;
  let formatted = number.trim().replace(/[^\d+]/g, '');
  if (!formatted) return null;
  if (!formatted.startsWith('+')) formatted = '+' + formatted;
  if (formatted.startsWith('+03')) formatted = '+92' + formatted.substring(2);
  else if (formatted.startsWith('03')) formatted = '+92' + formatted.substring(1);
  return formatted;
};

router.get('/groups', async (req, res) => {
  try {
    const connectedContacts = await Contact.find({ status: 1 });
    if (!connectedContacts.length) return res.status(404).json({ error: "No connected WhatsApp accounts found" });

    const results = [];
    for (const contact of connectedContacts) {
      try {
        const response = await axios.get("https://smspro.pk/api/get/wa.groups", {
          params: { secret: API_SECRET, unique: contact.uniqueId }
        });
        results.push({
          contact: {
            id: contact._id,
            whatsappId: contact.whatsappId,
            uniqueId: contact.uniqueId
          },
          groups: response.data
        });

        if (Array.isArray(response.data.groups)) {
          for (const group of response.data.groups) {
            await WhatsappGroup.findOneAndUpdate(
              { groupId: group.id, contactId: contact._id },
              {
                groupId: group.id,
                contactId: contact._id,
                name: group.name,
                subject: group.subject,
                creation: group.creation
              },
              { upsert: true, new: true }
            );
          }
        }
      } catch (error) {
        console.error(`Error fetching groups for contact ${contact.uniqueId}:`, error);
      }
    }
    res.json({ success: true, totalAccounts: results.length, results });
  } catch (error) {
    console.error("Error fetching WhatsApp groups:", error);
    res.status(500).json({ error: "Failed to fetch WhatsApp groups", message: error.message });
  }
});

router.get('/contact/:contactId/group/:groupId/contacts', async (req, res) => {
  try {
    const { contactId, groupId } = req.params;
    const contact = await Contact.findOne({ _id: contactId, status: 1 });
    if (!contact) return res.status(404).json({ error: "Connected WhatsApp account not found" });

    const response = await axios.get("https://smspro.pk/api/get/wa.group.contacts", {
      params: { secret: API_SECRET, unique: contact.uniqueId, gid: groupId }
    });
    res.json({ success: true, contactId, groupId, contacts: response.data });
  } catch (error) {
    console.error("Error fetching group contacts:", error);
    res.status(500).json({ error: "Failed to fetch group contacts", message: error.message });
  }
});

const getMessageTypeFromMimetype = mimetype => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype === 'application/pdf') return 'document';
  if (mimetype.includes('spreadsheet') || mimetype.includes('document') || mimetype.includes('presentation')) return 'document';
  return 'file';
};

const sendMessageToSingleRecipient = async (uniqueId, recipient, message, messageType, fileData) => {
  try {
    const formattedNumber = formatPhoneNumber(recipient);
    if (!formattedNumber) return { recipient, success: false, error: "Invalid phone number format" };

    console.log("Sending message to:", formattedNumber);
    console.log("Message Type:", messageType);
    if (message) console.log("Text Message:", message);
    if (fileData) console.log("File Data:", fileData);

    const data = new FormData();
    data.append('secret', API_SECRET);
    data.append('account', uniqueId);
    data.append('recipient', formattedNumber);
    
    // Determine the correct message type and add appropriate fields
    if (!fileData) {
      // Text only message
      data.append('type', 'text');
      data.append('message', message || '');
    } else if (fileData.mimetype.startsWith('image/') || 
               fileData.mimetype.startsWith('video/') || 
               fileData.mimetype.startsWith('audio/')) {
      // Media message (image, video, audio)
      data.append('type', 'media');
      data.append('message', message || ''); // This will be used as caption
      const fileStream = fs.createReadStream(fileData.path);
      data.append('media_file', fileStream, { filename: fileData.filename, contentType: fileData.mimetype });
      
      // If using media_url instead of direct file upload, you would use:
      // data.append('media_url', fileUrl);
      // data.append('media_type', mediaType); // 'image', 'audio', or 'video'
    } else {
      // Document message
      data.append('type', 'document');
      data.append('message', message || '');
      const fileStream = fs.createReadStream(fileData.path);
      data.append('document_file', fileStream, { filename: fileData.filename, contentType: fileData.mimetype });
      
      // If using document_url instead of direct file upload, you would use:
      // data.append('document_url', documentUrl);
      // data.append('document_name', fileData.filename);
      // data.append('document_type', documentType); // e.g., 'pdf', 'doc', etc.
    }

    const response = await axios.post("https://smspro.pk/api/send/whatsapp", data, {
      headers: { ...data.getHeaders(), 'Accept': 'application/json' }
    });

    console.log("API Response:", response.data);

    if (response.data?.status === 200) {
      return { recipient: formattedNumber, success: true, data: response.data };
    } else {
      return { recipient: formattedNumber, success: false, error: response.data.message || "API error" };
    }
  } catch (error) {
    console.error("Error while sending message:", error.message);
    return { recipient, success: false, error: error.message };
  }
};

router.post('/send', upload.single('file'), async (req, res) => {
  let fileData = null;
  try {
    console.log("Message Send Request Body:", req.body);
    console.log("Uploaded File:", req.file);

    let { contactId, message, recipients } = req.body;
    const customNumbers = req.body.customNumbers;
    const file = req.file;

    if (typeof recipients === 'string' && recipients.startsWith('[')) {
      try { recipients = JSON.parse(recipients); } catch { recipients = [recipients]; }
    }

    if ((!message || !message.trim()) && !file) {
      return res.status(400).json({ error: "Either message or file is required" });
    }

    if ((!recipients?.length && !customNumbers?.trim())) {
      return res.status(400).json({ error: "At least one recipient is required" });
    }

    const contact = await Contact.findOne({ _id: contactId, status: 1 });
    if (!contact) return res.status(404).json({ error: "Connected WhatsApp account not found" });

    let allRecipients = [];
    if (Array.isArray(recipients)) allRecipients = [...recipients];
    else if (typeof recipients === 'string') allRecipients = [recipients];

    if (customNumbers?.trim()) {
      const customArray = customNumbers.split(/[\n, ]+/).map(num => num.trim()).filter(Boolean);
      allRecipients.push(...customArray);
    }

    console.log("Final Recipients List:", allRecipients);

    fileData = file ? {
      path: file.path,
      filename: file.filename,
      mimetype: file.mimetype
    } : null;

    const messageType = fileData ? getMessageTypeFromMimetype(fileData.mimetype) : 'text';

    const results = [];
    for (const recipient of allRecipients) {
      const result = await sendMessageToSingleRecipient(contact.uniqueId, recipient, message, messageType, fileData);
      // console.log(`Result for ${recipient}:`, result);
      results.push(result);
    }

    res.json({ success: true, total: results.length, results });
  } catch (error) {
    console.error("Error in send route:", error);
    res.status(500).json({ error: "Failed to send messages", message: error.message });
  }
});

module.exports = router;
