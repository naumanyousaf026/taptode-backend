const axios = require('axios');
const cron = require('node-cron');
const Contact = require('../models/Contact');
const WhatsappGroup = require('../models/WhatsappGroup');

const API_SECRET = "e7d0098a46e0af84f43c2b240af5984ae267e08d";

// Run every 1 minute
cron.schedule('* * * * *', async () => {
//   console.log("🕐 CRON JOB: Fetching WhatsApp groups and contacts...");

  try {
    const lastConnectedContact = await Contact.findOne({ status: 1 }).sort({ connectedAt: -1 });

    if (!lastConnectedContact) {
    //   console.log("No connected WhatsApp account found");
      return;
    }

    const uniqueId = lastConnectedContact.uniqueId;

    // Fetch groups
    const groupsResponse = await axios.get("https://smspro.pk/api/get/wa.groups", {
      params: {
        secret: API_SECRET,
        unique: uniqueId
      }
    });

    const groups = groupsResponse.data || [];

    for (const group of groups) {
      const { name, id: gid } = group;

      // Fetch contacts from the group
      const contactsResponse = await axios.get("https://smspro.pk/api/get/wa.group.contacts", {
        params: {
          secret: API_SECRET,
          unique: uniqueId,
          gid
        }
      });

      const contacts = contactsResponse.data.map(phone => ({ phone }));

      // Store or update group in DB
      await WhatsappGroup.findOneAndUpdate(
        { gid },
        { name, gid, contacts },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    // console.log(`✅ CRON JOB SUCCESS: Stored ${groups.length} group(s)`);

  } catch (error) {
    // console.error("❌ CRON JOB ERROR:", error.message || error);
  }
});
