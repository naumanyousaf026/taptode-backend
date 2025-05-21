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

// Updated upload to handle multiple fields
const upload = multer({ 
  storage, 
  limits: { fileSize: 16 * 1024 * 1024 }
}).fields([
  { name: 'media_file', maxCount: 1 },
  { name: 'document_file', maxCount: 1 },
  { name: 'csvFile', maxCount: 1 },
  { name: 'attachment', maxCount: 1 }, // Keep this for backward compatibility
  { name: 'file', maxCount: 1 } // Added to match your frontend field name
]);

const formatPhoneNumber = number => {
  if (!number || typeof number !== 'string') return null;
  let formatted = number.trim().replace(/[^\d+]/g, '');
  if (!formatted) return null;
  
  // Handle Pakistani numbers
  if (formatted.startsWith('+03')) {
    formatted = '+92' + formatted.substring(3);
  } else if (formatted.startsWith('03')) {
    formatted = '+92' + formatted.substring(1);
  } else if (!formatted.startsWith('+')) {
    formatted = '+' + formatted;
  }
  
  console.log(`Formatted number: ${number} -> ${formatted}`);
  return formatted;
};

// Get all connected WhatsApp accounts
router.get('/accounts', async (req, res) => {
  try {
    const connectedContacts = await Contact.find({ status: 1 });
    if (!connectedContacts.length) {
      return res.status(404).json({ error: "No connected WhatsApp accounts found" });
    }
    
    res.json({ 
      success: true, 
      total: connectedContacts.length, 
      accounts: connectedContacts.map(contact => ({
        id: contact._id,
        whatsappId: contact.whatsappId,
        uniqueId: contact.uniqueId
      }))
    });
  } catch (error) {
    console.error("Error fetching WhatsApp accounts:", error);
    res.status(500).json({ error: "Failed to fetch WhatsApp accounts", message: error.message });
  }
});

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

// Process CSV file to extract phone numbers
const processCSV = async (filePath) => {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const lines = fileContent.split('\n');
    // Assuming the CSV has headers and numbers are in the first column
    // Skip header row (index 0) and extract first column, removing any quotes
    return lines.slice(1)
      .map(line => line.split(',')[0]?.trim().replace(/["']/g, ''))
      .filter(Boolean);
  } catch (error) {
    console.error("Error processing CSV file:", error);
    return [];
  }
};

const sendMessageToSingleRecipient = async (contact, recipient, message, type, fileData) => {
  try {
    const formattedNumber = formatPhoneNumber(recipient);
    if (!formattedNumber) return { recipient, success: false, error: "Invalid phone number format" };

    console.log(`Sending message from account ${contact.whatsappId} (${contact.uniqueId}) to: ${formattedNumber}`);
    console.log("Message Type:", type);
    if (message) console.log("Text Message:", message);
    if (fileData) console.log("File Data:", fileData.filename);

    const data = new FormData();
    data.append('secret', API_SECRET);
    data.append('account', contact.uniqueId);
    data.append('recipient', formattedNumber);
    data.append('message', message || ''); // Message/caption is always required
    
    // Set message type based on file or default to text
    let messageType = 'text';
    if (fileData) {
      if (fileData.mimetype.startsWith('image/') || 
          fileData.mimetype.startsWith('video/') || 
          fileData.mimetype.startsWith('audio/')) {
        messageType = 'media';
      } else {
        messageType = 'document';
      }
    }
    data.append('type', messageType);
    data.append('priority', '2'); // Default priority
    
    // Add file if provided
    if (fileData) {
      const fileStream = fs.createReadStream(fileData.path);
      
      if (messageType === 'media') {
        // Determine media_type from mimetype
        let media_type = 'image';
        if (fileData.mimetype.startsWith('video/')) media_type = 'video';
        else if (fileData.mimetype.startsWith('audio/')) media_type = 'audio';
        
        data.append('media_file', fileStream, { 
          filename: fileData.filename, 
          contentType: fileData.mimetype 
        });
        data.append('media_type', media_type);
      } 
      else if (messageType === 'document') {
        data.append('document_file', fileStream, { 
          filename: fileData.filename, 
          contentType: fileData.mimetype 
        });
        data.append('document_name', fileData.filename);
        
        // Determine document_type from file extension
        const ext = path.extname(fileData.filename).toLowerCase().substring(1);
        const document_type = ['pdf', 'xml', 'xls', 'xlsx', 'doc', 'docx'].includes(ext) ? ext : 'pdf';
        data.append('document_type', document_type);
      }
    }

    console.log("Sending data to API with fields:");
    console.log(`- secret: ${API_SECRET.substring(0, 5)}... (truncated)`);
    console.log(`- account: ${contact.uniqueId}`);
    console.log(`- recipient: ${formattedNumber}`);
    console.log(`- message: ${message || ''}`);
    console.log(`- type: ${messageType}`);
    console.log(`- priority: 2`);
    if (fileData) {
      console.log(`- File included: ${fileData.filename} (${fileData.mimetype})`);
      if (messageType === 'media') {
        console.log(`- media_type: ${fileData.mimetype.startsWith('video/') ? 'video' : fileData.mimetype.startsWith('audio/') ? 'audio' : 'image'}`);
      } else if (messageType === 'document') {
        const ext = path.extname(fileData.filename).toLowerCase().substring(1);
        const document_type = ['pdf', 'xml', 'xls', 'xlsx', 'doc', 'docx'].includes(ext) ? ext : 'pdf';
        console.log(`- document_type: ${document_type}`);
        console.log(`- document_name: ${fileData.filename}`);
      }
    }

    const response = await axios.post("https://smspro.pk/api/send/whatsapp", data, {
      headers: { ...data.getHeaders(), 'Accept': 'application/json' }
    });

    console.log("API Response:", response.data);

    if (response.data?.status === 200) {
      return { 
        recipient: formattedNumber, 
        success: true, 
        data: response.data,
        sentFrom: contact.whatsappId
      };
    } else {
      return { 
        recipient: formattedNumber, 
        success: false, 
        error: response.data.message || "API error",
        sentFrom: contact.whatsappId
      };
    }
  } catch (error) {
    console.error("Error while sending message:", error.message);
    console.error("Error details:", error);
    
    return { 
      recipient, 
      success: false, 
      error: error.message,
      sentFrom: contact.whatsappId
    };
  }
};

// Determine message type from mimetype
const getMessageTypeFromMimetype = mimetype => {
  if (!mimetype) return 'text';
  if (mimetype.startsWith('image/') || mimetype.startsWith('video/') || mimetype.startsWith('audio/')) {
    return 'media';
  }
  return 'document';
};

// Updated route to handle various field names and follow the API requirements exactly
router.post('/send', (req, res) => {
  upload(req, res, async (err) => {
    let fileData = null;

    try {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: "File upload error", message: err.message });
      } else if (err) {
        return res.status(500).json({ error: "Server error during file upload", message: err.message });
      }

      console.log("Message Send Request Body:", req.body);
      console.log("Uploaded Files:", req.files);

      const { contactId, message, customNumbers, type = 'text' } = req.body;
      
      // Handle files from various field names
      const file = req.files?.media_file?.[0] || 
                   req.files?.document_file?.[0] || 
                   req.files?.attachment?.[0] || 
                   req.files?.file?.[0] ||  // Added 'file' field name used by frontend
                   null;
      
      const csvFile = req.files?.csvFile?.[0] || null;

      // Validate contactId is provided
      if (!contactId) {
        return res.status(400).json({ error: "contactId is required to specify which WhatsApp account to use" });
      }

      // Find the specified WhatsApp account
      const contact = await Contact.findOne({ _id: contactId, status: 1 });
      if (!contact) {
        return res.status(404).json({ 
          error: "Connected WhatsApp account not found", 
          message: "Please make sure you've selected a valid connected WhatsApp account"
        });
      }

      console.log(`Using WhatsApp account: ${contact.whatsappId} (${contact.uniqueId})`);

      // Parse recipients if provided as JSON string
      let recipients = req.body.recipients || [];
      if (typeof recipients === 'string') {
        try { 
          if (recipients.startsWith('[')) {
            recipients = JSON.parse(recipients); 
          } else {
            recipients = [recipients];
          }
        } catch { 
          recipients = [recipients]; 
        }
      }

      // Process all recipient sources
      let allRecipients = [];
      
      // 1. From recipients array
      if (Array.isArray(recipients)) allRecipients = [...recipients];
      else if (typeof recipients === 'string') allRecipients = [recipients];
      
      // 2. From custom numbers input
      if (customNumbers?.trim()) {
        const customArray = customNumbers.split(/[\n, ]+/).map(num => num.trim()).filter(Boolean);
        allRecipients.push(...customArray);
      }
      
      // 3. From CSV file if provided
      if (csvFile) {
        const csvNumbers = await processCSV(csvFile.path);
        allRecipients.push(...csvNumbers);
      }

      if (allRecipients.length === 0) {
        return res.status(400).json({ error: "At least one recipient is required" });
      }

      // Always provide a message, even if it's empty
      const messageText = message || '';

      console.log("Final Recipients List:", allRecipients);

      if (file) {
        fileData = {
          path: file.path,
          filename: file.originalname,
          mimetype: file.mimetype
        };
      }

      // Determine message type based on the file or the specified type
      let messageType = type;
      if (file && !messageType) {
        messageType = getMessageTypeFromMimetype(file.mimetype);
      }

      const results = [];
      for (const recipient of allRecipients) {
        const result = await sendMessageToSingleRecipient(
          contact, 
          recipient, 
          messageText, 
          messageType, 
          fileData
        );
        results.push(result);
      }

      res.json({ 
        success: true, 
        total: results.length, 
        sentFrom: contact.whatsappId,
        results 
      });
    } catch (error) {
      console.error("Error in send route:", error);
      res.status(500).json({ error: "Failed to send messages", message: error.message });
    }
  });
});

module.exports = router;