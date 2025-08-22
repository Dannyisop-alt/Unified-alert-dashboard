const express = require('express');
const router = express.Router();
const Alert = require('../models/Alert');

// GET /alerts?source=oci or /alerts?source=graylog
router.get('/alerts', async (req, res) => {
  try {
    const source = req.query.source;
    const query = source ? { source } : {}; // If no source, return all

    const alerts = await Alert.find(query).sort({ timestamp: -1 });
    res.status(200).json(alerts);
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

module.exports = router;
