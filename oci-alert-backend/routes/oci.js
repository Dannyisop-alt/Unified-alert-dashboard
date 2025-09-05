// routes/oci.js - Simplified version without database storage
const express = require('express');
const router = express.Router();
const { getOCIAlerts } = require('../services/ociService');

// Direct OCI fetch endpoint - no database storage
router.get('/', async (req, res) => {
  try {
    // Fetching active alerts from OCI
    
    // Add timeout to prevent hanging requests
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('OCI request timeout')), 60000); // 60 second timeout
    });
    
    // Fetch fresh alerts directly from OCI with timeout
    const ociAlerts = await Promise.race([
      getOCIAlerts(),
      timeoutPromise
    ]);
    // Fetched alerts from OCI
    
    // Apply filters from query parameters
    const { 
      severity, 
      vm, 
      tenant, 
      region, 
      alertType,
      limit
    } = req.query;
    
    let filteredAlerts = ociAlerts;
    
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
    
    // Returning filtered alerts
    res.json(filteredAlerts);
    
  } catch (error) {
    console.error('❌ Error fetching OCI alerts:', error.message);
    console.error('❌ Error stack:', error.stack);
    
    // Don't crash the server, return empty array instead
    res.status(200).json([]);
  }
});

// Keep the pull endpoint for manual refresh (but don't save to DB)
router.post('/pull', async (req, res) => {
  try {
    // Manual pull triggered
    const ociAlerts = await getOCIAlerts();
    
    // Pull completed
    res.status(200).json({ 
      message: `Successfully pulled ${ociAlerts.length} active alerts from OCI`,
      alerts: ociAlerts,
      count: ociAlerts.length
    });
    
  } catch (error) {
    console.error('Error in OCI alert pull route:', error);
    res.status(500).json({ error: 'Failed to pull OCI alerts' });
  }
});

// Get unique values for filters directly from OCI data
router.get('/filters', async (req, res) => {
  try {
    // Fetching filter options
    const ociAlerts = await getOCIAlerts();
    
    // Extract unique values from the fresh OCI data
    const vms = [...new Set(ociAlerts.map(alert => alert.vm).filter(Boolean))];
    const tenants = [...new Set(ociAlerts.map(alert => alert.tenant).filter(Boolean))];
    const regions = [...new Set(ociAlerts.map(alert => alert.region).filter(Boolean))];
    const alertTypes = [...new Set(ociAlerts.map(alert => alert.alertType).filter(Boolean))];
    const severities = [...new Set(ociAlerts.map(alert => alert.severity).filter(Boolean))];

    // Filter options fetched
    res.json({
      vms,
      tenants,
      regions,
      alertTypes,
      severities
    });
    
  } catch (error) {
    console.error('Error fetching filter options:', error);
    res.status(500).json({ error: 'Failed to fetch filter options' });
  }
});

// Keep read/acknowledge endpoints for compatibility (but they won't persist)
router.put('/:id/read', async (req, res) => {
  try {
    // Since we're not storing in DB, just return success
    res.json({ message: 'Alert marked as read (not persisted)' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update alert' });
  }
});

router.put('/:id/acknowledge', async (req, res) => {
  try {
    // Since we're not storing in DB, just return success
    res.json({ message: 'Alert acknowledged (not persisted)' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

module.exports = router;
