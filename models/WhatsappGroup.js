const mongoose = require('mongoose');

const whatsappGroupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  gid: {
    type: String,
    required: true,
    unique: true
  },
  contacts: [
    {
      phone: {
        type: String,
        required: true
      }
    }
  ]
}, {
  timestamps: true
});

const WhatsappGroup = mongoose.model('WhatsappGroup', whatsappGroupSchema);

module.exports = WhatsappGroup;
