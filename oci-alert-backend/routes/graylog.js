const express = require('express');
const router = express.Router();
const GraylogAlert = require('../models/GraylogAlert');

// POST endpoint to receive Graylog alerts (Slack webhook format)
router.post('/', async (req, res) => {
  try {
    const body = req.body;
    console.log('Received Graylog alert:', JSON.stringify(body, null, 2));

    // Keep your original validation logic for backward compatibility
    if (!body || !body.attachments || !Array.isArray(body.attachments)) {
      return res.status(400).json({ error: 'Invalid Graylog alert structure' });
    }

    const attachment = body.attachments[0];
    
    // Enhanced message extraction logic
    let shortMessage = body.text || 'No message provided';
    let fullMessage = attachment?.text || '';
    
    // NEW: Check if title exists in attachment (for new Postman format)
    if (attachment?.title) {
      // If there's a title, use it as the short message (this handles your new format)
      shortMessage = attachment.title;
      // Keep the attachment text as full message
      if (attachment.text) {
        fullMessage = attachment.text;
      }
    }
    // FALLBACK: If no title but body.text exists, use original logic
    else if (body.text) {
      shortMessage = body.text;
    }
    
    // Convert color to severity (keep your original logic)
    const getSeverityFromColor = (color) => {
      const colorMap = {
        '#FF0000': 'critical',  // Red
        '#FFA500': 'high',      // Orange
        '#FFFF00': 'medium',    // Yellow
        '#008000': 'low',      // Green
        '#0000FF': 'info',      // Blue
        '#999999': 'unknown'    // Gray
      };
      return colorMap[color?.toUpperCase()] || 'unknown';
    };

    const alert = new GraylogAlert({
      channel: body.channel || 'Unknown',
      shortMessage: shortMessage,
      fullMessage: fullMessage,
      severity: getSeverityFromColor(attachment?.color) || 'unknown',
      color: attachment?.color || '#999999',
      username: body.username || 'Graylog',
      iconEmoji: body.icon_emoji || ':warning:',
    });

    await alert.save();
    console.log('Graylog alert saved successfully');
    res.status(201).json({ message: 'Graylog alert saved successfully', alert });
  } catch (error) {
    console.error('Error saving Graylog alert:', error);
    res.status(500).json({ error: 'Failed to save Graylog alert' });
  }
});

// GET endpoint to fetch all Graylog alerts
router.get('/', async (req, res) => {
  try {
    const { severity, limit = 100 } = req.query;
    
    let query = {};
    if (severity && severity !== 'all') {
      query.severity = severity;
    }

    const alerts = await GraylogAlert.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));
      
    res.json(alerts);
  } catch (error) {
    console.error('Error fetching Graylog alerts:', error);
    res.status(500).json({ error: 'Failed to fetch Graylog alerts' });
  }
});

// PUT endpoint to mark alert as read
router.put('/:id/read', async (req, res) => {
  try {
    const alert = await GraylogAlert.findByIdAndUpdate(
      req.params.id,
      { read: req.body.read },
      { new: true }
    );
    res.json(alert);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update alert' });
  }
});

// ➡️ NEW: PUT endpoint to mark alert as acknowledged
router.put('/:id/acknowledge', async (req, res) => {
  try {
    const { id } = req.params;
    const alert = await GraylogAlert.findByIdAndUpdate(id, { acknowledged: true }, { new: true });
    if (!alert) {
      return res.status(404).json({ message: 'Alert not found.' });
    }
    res.status(200).json(alert);
  } catch (error) {
    console.error('Error marking alert as acknowledged:', error);
    res.status(500).json({
      message: 'Failed to mark alert as acknowledged.',
      error: error.message,
    });
  }
});

module.exports = router;
