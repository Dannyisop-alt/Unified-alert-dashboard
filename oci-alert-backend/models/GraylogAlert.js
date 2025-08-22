const mongoose = require('mongoose');

const graylogAlertSchema = new mongoose.Schema({
  channel: {
    type: String,
    required: true
  },
  shortMessage: {
    type: String,
    required: true
  },
  fullMessage: String,
  severity: {
    type: String,
    enum: ['critical', 'high', 'medium', 'low', 'info', 'unknown'],
    default: 'unknown'
  },
  color: String, // Store original color for reference
  username: {
    type: String,
    default: 'Graylog'
  },
  iconEmoji: {
    type: String,
    default: ':warning:'
  },
  timestamp: { 
    type: Date, 
    default: Date.now 
  },
  read: { 
    type: Boolean, 
    default: false 
  },
  acknowledged: {
    type: Boolean,
    default: false
  }
});

module.exports = mongoose.model('GraylogAlert', graylogAlertSchema);