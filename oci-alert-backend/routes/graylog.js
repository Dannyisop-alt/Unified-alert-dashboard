const express = require('express');
const cron = require('node-cron');
const router = express.Router();

// 📋 MEMORY LIST - Unlimited capacity, resets daily at 12:05 AM
let alertsList = [];
let lastResetTime = new Date().toISOString();

// Color mapping for severity levels
const colorMap = {
  '#FF0000': 'critical',
  '#FFA500': 'high', 
  '#FFFF00': 'medium',
  '#008000': 'low',
  '#0000FF': 'info',
  '#999999': 'unknown'
};

// 🕐 DAILY RESET SCHEDULER - Every day at 12:05 AM
cron.schedule('5 0 * * *', () => {
  const beforeCount = alertsList.length;
  alertsList = []; // Clear the list
  lastResetTime = new Date().toISOString();
  console.log(`🔄 [DAILY RESET] Cleared ${beforeCount} alerts at 12:05 AM. Fresh start!`);
  console.log(`📅 [DAILY RESET] Next reset: Tomorrow at 12:05 AM`);
}, {
  timezone: "America/New_York" // Adjust timezone as needed
});

// POST endpoint - Receive Graylog webhooks and store in memory list
router.post('/', async (req, res) => {
  try {
    const body = req.body;
    console.log('📨 [WEBHOOK] Received Graylog alert:', JSON.stringify(body, null, 2));
    
    // Validation
    if (!body || !body.attachments || !Array.isArray(body.attachments)) {
      return res.status(400).json({ error: 'Invalid webhook data format' });
    }

    // Process alerts
    const newAlerts = body.attachments.map(attachment => {
      let shortMessage = body.text || 'No message provided';
      let fullMessage = attachment?.text || '';
      
      if (attachment?.title) {
        shortMessage = attachment.title;
        if (attachment.text) {
          fullMessage = attachment.text;
        }
      } else if (body.text) {
        shortMessage = body.text;
      }

      return {
        _id: `graylog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        channel: body.channel || 'Unknown',
        shortMessage: shortMessage,
        fullMessage: fullMessage,
        severity: colorMap[attachment?.color?.toUpperCase()] || 'unknown',
        color: attachment?.color || '#999999',
        username: body.username || 'Graylog',
        iconEmoji: body.icon_emoji || ':warning:',
        timestamp: new Date().toISOString(),
        read: false,
        acknowledged: false
      };
    });

    // 📋 ADD TO MEMORY LIST (unlimited capacity)
    alertsList.unshift(...newAlerts); // Add newest alerts to the beginning

    console.log(`✅ [MEMORY] Added ${newAlerts.length} alerts to memory list`);
    console.log(`📊 [MEMORY] Total alerts in memory: ${alertsList.length}`);
    
    res.status(200).json({ 
      success: true, 
      processed: newAlerts.length,
      totalInMemory: alertsList.length,
      storageMode: 'Memory List',
      nextReset: 'Tomorrow 12:05 AM'
    });

  } catch (error) {
    console.error('❌ [ERROR] Failed to process Graylog webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// GET endpoint - Return alerts from memory list with severity filtering
router.get('/', async (req, res) => {
  try {
    const { severity, limit = 100 } = req.query;
    let filteredAlerts = [...alertsList]; // Copy the list

    // Apply severity filter
    if (severity && severity !== 'all') {
      filteredAlerts = filteredAlerts.filter(alert => alert.severity === severity);
    }

    // Apply limit
    const limitedAlerts = filteredAlerts.slice(0, parseInt(limit));

    console.log(`📤 [GET] Returning ${limitedAlerts.length} alerts (filtered from ${alertsList.length} total)`);
    console.log(`🔍 [FILTER] Severity filter: ${severity || 'all'}, Limit: ${limit}`);
    
    res.json(limitedAlerts);
  } catch (error) {
    console.error('❌ [ERROR] Failed to fetch alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// PUT endpoint - Mark alert as read
router.put('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const { read } = req.body;
    
    const alertIndex = alertsList.findIndex(alert => alert._id === id);
    if (alertIndex === -1) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    alertsList[alertIndex].read = read;
    console.log(`📖 [UPDATE] Alert ${id} marked as ${read ? 'read' : 'unread'}`);
    
    res.json(alertsList[alertIndex]);
  } catch (error) {
    console.error('❌ [ERROR] Failed to update alert:', error);
    res.status(500).json({ error: 'Failed to update alert' });
  }
});

// PUT endpoint - Acknowledge alert
router.put('/:id/acknowledge', async (req, res) => {
  try {
    const { id } = req.params;
    
    const alertIndex = alertsList.findIndex(alert => alert._id === id);
    if (alertIndex === -1) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    alertsList[alertIndex].acknowledged = true;
    console.log(`✅ [ACKNOWLEDGE] Alert ${id} acknowledged`);
    
    res.json(alertsList[alertIndex]);
  } catch (error) {
    console.error('❌ [ERROR] Failed to acknowledge alert:', error);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

// Status endpoint - Show memory list stats
router.get('/status', async (req, res) => {
  try {
    res.json({
      status: 'Memory List Active',
      totalAlertsInMemory: alertsList.length,
      storageMode: 'Unlimited Memory List',
      lastReset: lastResetTime,
      nextReset: 'Daily at 12:05 AM',
      resetSchedule: 'Every day at 12:05 AM',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ [ERROR] Failed to get status:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

// Manual reset endpoint (for testing)
router.post('/reset', async (req, res) => {
  try {
    const beforeCount = alertsList.length;
    alertsList = [];
    lastResetTime = new Date().toISOString();
    
    console.log(`🔄 [MANUAL RESET] Cleared ${beforeCount} alerts manually`);
    
    res.json({
      message: 'Memory list manually reset',
      clearedAlerts: beforeCount,
      resetTime: lastResetTime
    });
  } catch (error) {
    console.error('❌ [ERROR] Failed to reset alerts:', error);
    res.status(500).json({ error: 'Failed to reset alerts' });
  }
});

module.exports = router;