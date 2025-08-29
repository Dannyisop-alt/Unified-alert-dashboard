const mongoose = require('mongoose');

const ociAlertSchema = new mongoose.Schema({
  // New field to store the unique Oracle alarm ID
  id: {
    type: String,
    required: true,
    unique: true
  },
  severity: {
    type: String,
    // Updated enum list to include all possible OCI alarm severities
    enum: ['critical', 'error', 'warning', 'info'],
    required: true
  },
  message: {
    type: String,
    required: true
  },
  vm: {
    type: String,
    required: true
  },
  tenant: {
    type: String,
    required: true
  },
  region: String,
  compartment: String,
  alertType: String,
  metricName: String,
  threshold: Number,
  currentValue: Number,
  unit: String,
  timestamp: {
    type: Date,
    // The default value has been removed.
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

module.exports = mongoose.model('OCIAlert', ociAlertSchema);