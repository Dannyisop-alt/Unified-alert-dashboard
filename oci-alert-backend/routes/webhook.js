const express = require('express');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const router = express.Router();

// Create logs directory if it doesn't exist - Environment aware
const logsDir = process.env.LOGS_DIR || path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
  console.log('📁 [LOGS] Created logs directory:', logsDir);
}

// Memory storage for alerts (unlimited capacity)
const alertMemory = [];
const rawWebhookMemory = []; // Store raw webhook data for debugging
const MAX_ALERTS = 10000; // Set a high limit but not unlimited to prevent memory issues
const MAX_RAW_WEBHOOKS = 50; // Store last 50 raw webhook payloads

// Deduplication tracking
const dedupeKeys = new Set(); // Track seen dedupe keys
const alertDedupeMap = new Map(); // Map dedupeKey to alert data for updates

// 🔄 DEDUPLICATION FUNCTIONS
function isDuplicateAlert(dedupeKey) {
  return dedupeKeys.has(dedupeKey);
}

function updateExistingAlert(dedupeKey, newAlertData) {
  // Find the existing alert in memory and update it
  const existingIndex = alertMemory.findIndex(alert => alert.dedupeKey === dedupeKey);
  if (existingIndex !== -1) {
    // Update the existing alert with new data (especially timestamp and metric values)
    alertMemory[existingIndex] = {
      ...alertMemory[existingIndex],
      ...newAlertData,
      dedupeKey: dedupeKey, // Ensure dedupeKey is preserved
      lastUpdated: new Date().toISOString()
    };
    console.log(`🔄 [DEDUPE] Updated existing alert for dedupeKey: ${dedupeKey}`);
    return true;
  }
  return false;
}

function addNewAlert(alertData) {
  // Add to memory array
  alertMemory.unshift(alertData);
  
  // Track the dedupe key
  if (alertData.dedupeKey) {
    dedupeKeys.add(alertData.dedupeKey);
    alertDedupeMap.set(alertData.dedupeKey, alertData);
  }
  
  // Keep only the latest MAX_ALERTS to prevent memory issues
  if (alertMemory.length > MAX_ALERTS) {
    const removedAlert = alertMemory.pop();
    // Clean up dedupe tracking for removed alert
    if (removedAlert.dedupeKey) {
      dedupeKeys.delete(removedAlert.dedupeKey);
      alertDedupeMap.delete(removedAlert.dedupeKey);
    }
  }
  
  console.log(`✅ [DEDUPE] Added new alert for dedupeKey: ${alertData.dedupeKey}`);
}

// 📝 LOGGING FUNCTIONS
function determineAlertType(webhookData) {
  try {
    const query = webhookData.query || '';
    const name = (webhookData.name || '').toLowerCase();
    const summary = (webhookData.alarmSummary || '').toLowerCase();
    
    // Check query for server metrics
    if (query.includes('CpuUtilization') || 
        query.includes('MemoryUtilization') || 
        query.includes('DiskUtilization') ||
        query.includes('NetworkIn') ||
        query.includes('NetworkOut')) {
      return 'server';
    }
    
    // Check query for database metrics
    if (query.includes('Database') || 
        query.includes('Tablespace') ||
        query.includes('DBCPUUtilization') ||
        query.includes('SessionCount')) {
      return 'database';
    }
    
    // Check name and summary for keywords
    if (name.includes('server') || name.includes('vm') || name.includes('instance') ||
        summary.includes('server') || summary.includes('vm') || summary.includes('cpu') ||
        summary.includes('memory') || summary.includes('disk')) {
      return 'server';
    }
    
    if (name.includes('database') || name.includes('db') || name.includes('oracle') ||
        summary.includes('database') || summary.includes('db') || summary.includes('sql')) {
      return 'database';
    }
    
    // Default to server if unable to determine
    console.log('⚠️ [LOGS] Unable to determine alert type, defaulting to server');
    return 'server';
  } catch (error) {
    console.error('❌ [LOGS] Error determining alert type:', error);
    return 'server';
  }
}

function logRawAlert(rawPayload, alertType) {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const logFileName = `${alertType}-alerts-${today}.json`;
    const logFilePath = path.join(logsDir, logFileName);
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      alertType: alertType,
      source: 'oracle-webhook',
      rawPayload: rawPayload // Exact Oracle payload - NO MODIFICATIONS
    };
    
    // Append to log file
    const logLine = JSON.stringify(logEntry) + '\n';
    fs.appendFileSync(logFilePath, logLine);
    
    console.log(`📝 [LOGS] Raw alert logged to: ${logFileName} (type: ${alertType})`);
  } catch (error) {
    console.error('❌ [LOGS] Error writing to log file:', error);
  }
}

// 🕐 DAILY RESET SCHEDULER - Every day at 12:05 AM (same as application logs)
cron.schedule('5 0 * * *', () => {
  const beforeCount = alertMemory.length;
  const rawWebhookCount = rawWebhookMemory.length;
  const dedupeCount = dedupeKeys.size;
  alertMemory.length = 0; // Clear the memory array
  rawWebhookMemory.length = 0; // Clear raw webhook memory
  dedupeKeys.clear(); // Clear dedupe tracking
  alertDedupeMap.clear(); // Clear dedupe mapping
  const resetTime = new Date().toISOString();
  console.log(`🧹 [CRON] OCI Alert Memory Reset: Cleared ${beforeCount} alerts, ${rawWebhookCount} raw webhooks, and ${dedupeCount} dedupe keys at ${resetTime}`);
}, {
  timezone: "America/New_York" // Same timezone as application logs
});

// 🧹 PERIODIC CLEANUP - Every 6 hours, clean up old dedupe keys
cron.schedule('0 */6 * * *', () => {
  const currentTime = new Date();
  const sixHoursAgo = new Date(currentTime.getTime() - 6 * 60 * 60 * 1000);
  
  // Remove dedupe keys for alerts older than 6 hours
  let cleanedCount = 0;
  for (const [dedupeKey, alertData] of alertDedupeMap.entries()) {
    const alertTime = new Date(alertData.timestamp);
    if (alertTime < sixHoursAgo) {
      dedupeKeys.delete(dedupeKey);
      alertDedupeMap.delete(dedupeKey);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 [CLEANUP] Cleaned up ${cleanedCount} old dedupe keys. Remaining: ${dedupeKeys.size}`);
  }
}, {
  timezone: "America/New_York"
});

// Webhook endpoint to receive OCI alerts and broadcast to frontend
router.post('/oci-alerts', async (req, res) => {
  try {
    console.log('-----------------------------');
    console.log(`🟢 [${new Date().toISOString()}] POST /webhook/oci-alerts`);
    console.log('📥 Headers:', req.headers);
    console.log('📦 Body:', JSON.stringify(req.body, null, 2));
    
    const webhookData = req.body;
    
    // 🔔 HANDLE OCI SUBSCRIPTION CONFIRMATION (MANUAL METHOD)
    if (webhookData.type === 'SubscriptionConfirmation') {
      console.log('📧 [SUBSCRIPTION] Received OCI subscription confirmation request');
      console.log('📧 [SUBSCRIPTION] Message:', webhookData.message);
      console.log('📧 [SUBSCRIPTION] Topic ID:', webhookData.topicId);
      console.log('📧 [SUBSCRIPTION] Confirmation URL:', webhookData.confirmationUrl);
      console.log('📧 [SUBSCRIPTION] Please manually visit the confirmation URL to complete subscription');
      
      // Store the confirmation request for manual processing
      const confirmationLog = {
        timestamp: new Date().toISOString(),
        type: 'subscription_confirmation',
        topicId: webhookData.topicId,
        messageId: webhookData.messageId,
        confirmationUrl: webhookData.confirmationUrl,
        status: 'pending_manual_confirmation'
      };
      
      // Store in raw webhook memory for debugging
      rawWebhookMemory.unshift({
        id: `confirmation-${Date.now()}`,
        timestamp: new Date().toISOString(),
        rawPayload: confirmationLog,
        headers: req.headers
      });
      
      return res.status(200).json({ 
        message: 'Subscription confirmation received - please visit the confirmation URL manually',
        topicId: webhookData.topicId,
        confirmationUrl: webhookData.confirmationUrl,
        status: 'pending_manual_confirmation'
      });
    }
    
    // 📝 LOG RAW ALERT TO FILE (EXACT ORACLE DATA - NO MODIFICATIONS)
    const alertType = determineAlertType(webhookData);
    logRawAlert(webhookData, alertType);
    
    // Store raw webhook data for debugging
    const rawWebhookData = {
      id: `raw-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      rawPayload: JSON.parse(JSON.stringify(req.body)), // Deep copy
      headers: req.headers
    };
    
    rawWebhookMemory.unshift(rawWebhookData); // Add to beginning
    if (rawWebhookMemory.length > MAX_RAW_WEBHOOKS) {
      rawWebhookMemory.splice(MAX_RAW_WEBHOOKS);
    }
    
    // Ultra-flexible webhook data structure - accept ANY JSON format
    let payload;
    
    if (webhookData.payload) {
      // Wrapped format: { payload: { ... } }
      payload = webhookData.payload;
      console.log('📦 [WEBHOOK] Using wrapped payload format');
    } else {
      // Direct format - accept ANY structure
      payload = webhookData;
      console.log('📦 [WEBHOOK] Using direct payload format - flexible parsing');
    }
    
    // Ultra-flexible field extraction - try multiple possible field names
    const extractField = (obj, possibleNames, defaultValue = 'Unknown') => {
      for (const name of possibleNames) {
        if (obj && obj[name] !== undefined && obj[name] !== null && obj[name] !== '') {
          return obj[name];
        }
      }
      return defaultValue;
    };

    // Extract all possible fields with multiple name variations
    const title = extractField(payload, ['title', 'message', 'alertTitle', 'name', 'subject'], 'No title available');
    const severity = extractField(payload, ['severity', 'level', 'priority', 'alertLevel'], 'warning').toLowerCase();
    const vm = extractField(payload, ['vm', 'resourceDisplayName', 'hostname', 'instanceName', 'serverName'], 'Unknown VM');
    const region = extractField(payload, ['region', 'location', 'zone', 'availabilityZone'], 'Unknown region');
    const status = extractField(payload, ['status', 'state', 'condition'], 'UNKNOWN');
    const query = extractField(payload, ['query', 'metricQuery', 'expression', 'rule'], '');
    const timestampEpochMillis = extractField(payload, ['timestampEpochMillis', 'timestamp', 'time', 'createdAt', 'lastUpdated'], null);
    
    // Extract dimensions/resource info
    const dimensions = {
      resourceDisplayName: extractField(payload, ['resourceDisplayName', 'vm', 'hostname', 'instanceName'], 'Unknown VM'),
      resourceId: extractField(payload, ['resourceId', 'instanceId', 'id'], ''),
      imageId: extractField(payload, ['imageId', 'image'], ''),
      shape: extractField(payload, ['shape', 'instanceType', 'size'], ''),
      availabilityDomain: extractField(payload, ['availabilityDomain', 'zone', 'az'], ''),
      faultDomain: extractField(payload, ['faultDomain', 'fd'], ''),
      instancePoolId: extractField(payload, ['instancePoolId', 'poolId'], ''),
      region: extractField(payload, ['region', 'location'], 'Unknown region')
    };

    console.log('🔍 [WEBHOOK] Extracted fields:', {
      title, severity, vm, region, status, query,
      hasTimestamp: !!timestampEpochMillis
    });
    
    const alertData = {
      id: extractField(payload, ['id', 'alarmOCID', 'alarmId', 'alertId'], `webhook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`),
      severity: severity,
      message: title,
      vm: vm,
      tenant: extractField(payload, ['tenant', 'organization', 'company'], 'N/A'),
      region: region,
      compartment: extractField(payload, ['compartment', 'compartmentId', 'orgId'], 'N/A'),
      alertType: extractField(payload, ['alertType', 'type', 'category'], 'REPEAT'),
      metricName: extractField(payload, ['metricName', 'metric', 'measurement'], ''),
      threshold: extractField(payload, ['threshold', 'limit', 'maxValue'], 0),
      currentValue: extractField(payload, ['currentValue', 'value', 'metricValue'], 0),
      unit: extractField(payload, ['unit', 'measurementUnit'], '%'),
      resourceDisplayName: vm,
      metricValues: extractField(payload, ['metricValues', 'metrics', 'data'], {}),
      query: query,
      timestamp: extractField(payload, ['timestamp', 'time', 'createdAt'], new Date().toISOString()),
      webhookReceivedAt: extractField(payload, ['webhookReceivedAt', 'receivedAt', 'lastUpdated'], new Date().toISOString()),
      // Additional fields for new format
      alarmSummary: extractField(payload, ['alarmSummary', 'summary', 'description'], ''),
      title: title,
      dedupeKey: extractField(payload, ['dedupeKey', 'deduplicationKey', 'uniqueId'], `webhook-${Date.now()}`),
      alarmOCID: extractField(payload, ['alarmOCID', 'alarmId', 'id'], ''),
      resourceId: dimensions.resourceId,
      imageId: dimensions.imageId,
      shape: dimensions.shape,
      availabilityDomain: dimensions.availabilityDomain,
      faultDomain: dimensions.faultDomain,
      instancePoolId: dimensions.instancePoolId,
      // New fields for status and timestamp display
      status: status,
      timestampEpochMillis: timestampEpochMillis
    };

    // Check for duplicates using dedupeKey
    const dedupeKey = alertData.dedupeKey;
    let isDuplicate = false;
    let action = 'new';
    
    if (dedupeKey && isDuplicateAlert(dedupeKey)) {
      // Update existing alert instead of creating duplicate
      isDuplicate = true;
      action = 'updated';
      updateExistingAlert(dedupeKey, alertData);
    } else {
      // Add new alert
      addNewAlert(alertData);
    }
    
    console.log(`✅ [WEBHOOK] Alert ${action} in memory:`, {
      id: alertData.id,
      message: alertData.message,
      severity: alertData.severity,
      vm: alertData.vm,
      tenant: alertData.tenant,
      dedupeKey: dedupeKey,
      isDuplicate: isDuplicate,
      totalAlerts: alertMemory.length,
      uniqueAlerts: dedupeKeys.size,
      memoryUsage: `${alertMemory.length}/${MAX_ALERTS} (${((alertMemory.length / MAX_ALERTS) * 100).toFixed(1)}%)`
    });

    res.status(200).json({ 
      message: `Alert ${action} successfully`,
      alertId: alertData.id,
      totalAlerts: alertMemory.length,
      uniqueAlerts: dedupeKeys.size,
      isDuplicate: isDuplicate,
      dedupeKey: dedupeKey
    });

  } catch (error) {
    console.error('❌ [WEBHOOK] Error processing webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Get all alerts from memory
router.get('/alerts', (req, res) => {
  try {
    console.log(`📋 [MEMORY] Fetching ${alertMemory.length} alerts from memory`);
    
    // Apply filters from query parameters
    const { 
      severity, 
      vm, 
      tenant, 
      region, 
      alertType,
      limit
    } = req.query;
    
    let filteredAlerts = [...alertMemory]; // Create a copy
    
    if (severity && severity !== 'all') {
      filteredAlerts = filteredAlerts.filter(alert => 
        alert.severity.toLowerCase() === severity.toLowerCase()
      );
    }
    
    if (vm && vm !== 'all') {
      filteredAlerts = filteredAlerts.filter(alert => 
        alert.vm && alert.vm.toLowerCase().includes(vm.toLowerCase())
      );
    }
    
    if (tenant && tenant !== 'all') {
      filteredAlerts = filteredAlerts.filter(alert => 
        alert.tenant && alert.tenant.toLowerCase() === tenant.toLowerCase()
      );
    }
    
    if (region && region !== 'all') {
      filteredAlerts = filteredAlerts.filter(alert => 
        alert.region && alert.region.toLowerCase() === region.toLowerCase()
      );
    }
    
    if (alertType && alertType !== 'all') {
      filteredAlerts = filteredAlerts.filter(alert => 
        alert.alertType && alert.alertType.toLowerCase() === alertType.toLowerCase()
      );
    }
    
    // Apply limit if specified
    if (limit && parseInt(limit) > 0) {
      filteredAlerts = filteredAlerts.slice(0, parseInt(limit));
    }
    
    console.log(`✅ [MEMORY] Returning ${filteredAlerts.length} filtered alerts`);
    res.json(filteredAlerts);
    
  } catch (error) {
    console.error('❌ [MEMORY] Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// Get unique values for filters
router.get('/filters', (req, res) => {
  try {
    const vms = [...new Set(alertMemory.map(alert => alert.vm).filter(Boolean))];
    const tenants = [...new Set(alertMemory.map(alert => alert.tenant).filter(Boolean))];
    const regions = [...new Set(alertMemory.map(alert => alert.region).filter(Boolean))];
    const alertTypes = [...new Set(alertMemory.map(alert => alert.alertType).filter(Boolean))];
    const severities = [...new Set(alertMemory.map(alert => alert.severity).filter(Boolean))];

    res.json({
      vms,
      tenants,
      regions,
      alertTypes,
      severities
    });
    
  } catch (error) {
    console.error('❌ [MEMORY] Error fetching filter options:', error);
    res.status(500).json({ error: 'Failed to fetch filter options' });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    totalAlerts: alertMemory.length,
    timestamp: new Date().toISOString(),
    mode: 'Memory storage'
  });
});

// DEBUG: Raw webhook data endpoint - shows actual raw webhook payloads
router.get('/debug/raw-webhooks', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const recentRawWebhooks = rawWebhookMemory.slice(0, limit);
    
    res.json({
      message: `Last ${recentRawWebhooks.length} raw webhook payloads`,
      totalRawWebhooks: rawWebhookMemory.length,
      totalProcessedAlerts: alertMemory.length,
      recentRawWebhooks: recentRawWebhooks,
      note: 'This shows the actual raw JSON data received from OCI webhooks'
    });
  } catch (error) {
    console.error('❌ [DEBUG] Error fetching raw webhook data:', error);
    res.status(500).json({ error: 'Failed to fetch raw webhook data' });
  }
});

// Clear all alerts (for testing)
router.delete('/alerts', (req, res) => {
  try {
    const clearedCount = alertMemory.length;
    alertMemory.length = 0; // Clear the array
    console.log(`🧹 [MANUAL] OCI Alert Memory Reset: Cleared ${clearedCount} alerts`);
    res.json({ 
      message: `Cleared ${clearedCount} alerts from memory`,
      clearedCount,
      resetTime: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ [MANUAL] Error clearing alerts:', error);
    res.status(500).json({ error: 'Failed to clear alerts' });
  }
});

// 📁 LOG FILE SHARING ENDPOINTS (SIMPLE - FOR TEMPORARY USE)

// List all available log files
router.get('/logs', (req, res) => {
  try {
    const logFiles = fs.readdirSync(logsDir)
      .filter(file => file.endsWith('.json'))
      .map(file => {
        const stats = fs.statSync(path.join(logsDir, file));
        return {
          filename: file,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        };
      })
      .sort((a, b) => b.modified - a.modified);

    res.json({
      message: 'Available log files',
      logFiles: logFiles,
      totalFiles: logFiles.length
    });
  } catch (error) {
    console.error('❌ [LOGS] Error listing log files:', error);
    res.status(500).json({ error: 'Failed to list log files' });
  }
});

// Download specific log file
router.get('/logs/download/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(logsDir, filename);
    
    // Security check - only allow JSON files in logs directory
    if (!filename.endsWith('.json') || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Log file not found' });
    }
    
    console.log(`📥 [LOGS] Downloading log file: ${filename}`);
    res.download(filePath, filename);
  } catch (error) {
    console.error('❌ [LOGS] Error downloading log file:', error);
    res.status(500).json({ error: 'Failed to download log file' });
  }
});

// Get log file content (for viewing in browser)
router.get('/logs/view/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(logsDir, filename);
    
    // Security check
    if (!filename.endsWith('.json') || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Log file not found' });
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const alerts = content.trim().split('\n').map(line => JSON.parse(line));
    
    res.json({
      filename: filename,
      totalAlerts: alerts.length,
      alerts: alerts
    });
  } catch (error) {
    console.error('❌ [LOGS] Error viewing log file:', error);
    res.status(500).json({ error: 'Failed to view log file' });
  }
});

// Get memory status
router.get('/status', (req, res) => {
  try {
    res.json({
      totalAlerts: alertMemory.length,
      uniqueAlerts: dedupeKeys.size,
      maxAlerts: MAX_ALERTS,
      memoryUsage: `${alertMemory.length}/${MAX_ALERTS} (${((alertMemory.length / MAX_ALERTS) * 100).toFixed(1)}%)`,
      deduplicationEnabled: true,
      duplicatePrevention: `${((dedupeKeys.size / alertMemory.length) * 100).toFixed(1)}% unique alerts`,
      lastReset: 'Daily at 12:05 AM (America/New_York)',
      nextReset: 'Next reset at 12:05 AM tomorrow'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get memory status' });
  }
});

// Debug endpoint to check deduplication
router.get('/debug/deduplication', (req, res) => {
  try {
    const duplicateCount = alertMemory.length - dedupeKeys.size;
    const duplicatePercentage = alertMemory.length > 0 ? ((duplicateCount / alertMemory.length) * 100).toFixed(1) : 0;
    
    res.json({
      totalAlerts: alertMemory.length,
      uniqueAlerts: dedupeKeys.size,
      duplicatesPrevented: duplicateCount,
      duplicatePercentage: `${duplicatePercentage}%`,
      dedupeKeys: Array.from(dedupeKeys).slice(0, 10), // Show first 10 dedupe keys
      recentAlerts: alertMemory.slice(0, 5).map(alert => ({
        id: alert.id,
        title: alert.title,
        dedupeKey: alert.dedupeKey,
        timestamp: alert.timestamp
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get deduplication info' });
  }
});

// Helper functions to extract data from webhook payload
function extractResourceDisplayName(dimensions) {
  if (!dimensions || !Array.isArray(dimensions) || dimensions.length === 0) {
    return 'N/A';
  }
  
  const dimension = dimensions[0];
  return dimension.resourceDisplayName || 'N/A';
}

function extractTenantFromCompartment(dimensions) {
  if (!dimensions || !Array.isArray(dimensions) || dimensions.length === 0) {
    return 'Unknown Tenant';
  }
  
  // For now, return a placeholder - in production, you might want to map compartment IDs to tenant names
  return 'GATRA'; // Default tenant name
}

function extractRegionFromDimensions(dimensions) {
  if (!dimensions || !Array.isArray(dimensions) || dimensions.length === 0) {
    return 'us-ashburn-1'; // Default region
  }
  
  const dimension = dimensions[0];
  return dimension.region || 'us-ashburn-1';
}

function extractCompartmentFromDimensions(dimensions) {
  if (!dimensions || !Array.isArray(dimensions) || dimensions.length === 0) {
    return 'N/A';
  }
  
  const dimension = dimensions[0];
  return dimension.compartmentId || 'N/A';
}

function extractMetricName(query) {
  if (!query) return 'Unknown';
  
  // Extract metric name from query like "CpuUtilization[5m].percentile(.90) > 80"
  const match = query.match(/^([A-Za-z]+)\[/);
  return match ? match[1] : 'Unknown';
}

function extractThreshold(query) {
  if (!query) return null;
  
  // Extract threshold from query like "CpuUtilization[5m].percentile(.90) > 80"
  const match = query.match(/>\s*(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

function extractCurrentValue(metricValues) {
  if (!metricValues || !Array.isArray(metricValues) || metricValues.length === 0) {
    return null;
  }
  
  const metricValue = metricValues[0];
  if (metricValue && typeof metricValue === 'object') {
    const values = Object.values(metricValue);
    return values.length > 0 ? parseFloat(values[0]) : null;
  }
  
  return null;
}

function extractUnit(query) {
  if (!query) return '%';
  
  // Default to percentage for CPU utilization
  if (query.toLowerCase().includes('cpu')) {
    return '%';
  }
  
  return '%';
}

function extractImageId(dimensions) {
  if (!dimensions || !Array.isArray(dimensions) || dimensions.length === 0) {
    return null;
  }
  
  const dimension = dimensions[0];
  return dimension.imageId || null;
}

function extractResourceId(dimensions) {
  if (!dimensions || !Array.isArray(dimensions) || dimensions.length === 0) {
    return null;
  }
  
  const dimension = dimensions[0];
  return dimension.resourceId || null;
}

module.exports = router;
