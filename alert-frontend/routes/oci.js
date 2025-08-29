// routes/oci.js
const express = require('express');
const router = express.Router();
const OCIAlert = require('../models/OciAlert');
const { getOCIAlerts } = require('../services/ociService');

// This is the new endpoint to trigger the pull and save process.
// Your frontend can call this periodically or on user request.
router.post('/pull', async (req, res) => {
  try {
    console.log('Manually pulling OCI alerts...');
    const ociAlerts = await getOCIAlerts();
    
    // Iterate through the alerts and save them to the database
    const savedAlerts = [];
    for (const alertData of ociAlerts) {
      // ✅ FIX: Check for a duplicate using the unique 'id' from Oracle
      const existingAlert = await OCIAlert.findOne({ id: alertData.id });
      
      if (!existingAlert) {
        const newAlert = new OCIAlert(alertData);
        await newAlert.save();
        savedAlerts.push(newAlert);
      }
    }
    
    console.log(`Successfully pulled and saved ${savedAlerts.length} new OCI alerts.`);
    res.status(200).json({ 
      message: `Pulled and saved ${savedAlerts.length} new OCI alerts`,
      newAlerts: savedAlerts 
    });
    
  } catch (error) {
    console.error('Error in OCI alert pull route:', error);
    res.status(500).json({ error: 'Failed to pull and save OCI alerts' });
  }
});

// Original GET alerts with filtering
router.get('/', async (req, res) => {
  try {
    const { 
      severity, 
      vm, 
      tenant, 
      region, 
      alertType,
      limit = 100 
    } = req.query;
    
    let query = {};
    
    if (severity && severity !== 'all') {
      query.severity = severity;
    }
    if (vm && vm !== 'all') {
      query.vm = vm;
    }
    if (tenant && tenant !== 'all') {
      query.tenant = tenant;
    }
    if (region && region !== 'all') {
      query.region = region;
    }
    if (alertType && alertType !== 'all') {
      query.alertType = alertType;
    }

    const alerts = await OCIAlert.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));
      
    res.json(alerts);
  } catch (error) {
    console.error('Error fetching OCI alerts:', error);
    res.status(500).json({ error: 'Failed to fetch OCI alerts' });
  }
});

// Original PUT endpoint to mark alert as read
router.put('/:id/read', async (req, res) => {
  try {
    const alert = await OCIAlert.findByIdAndUpdate(
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
    const alert = await OCIAlert.findByIdAndUpdate(id, { acknowledged: true }, { new: true });
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


// Original GET unique values for filters
router.get('/filters', async (req, res) => {
  try {
    const [vms, tenants, regions, alertTypes, severities] = await Promise.all([
      OCIAlert.distinct('vm'),
      OCIAlert.distinct('tenant'),
      OCIAlert.distinct('region'),
      OCIAlert.distinct('alertType'),
      OCIAlert.distinct('severity')
    ]);

    res.json({
      vms: vms.filter(Boolean),
      tenants: tenants.filter(Boolean),
      regions: regions.filter(Boolean),
      alertTypes: alertTypes.filter(Boolean),
      severities: severities.filter(Boolean)
    });
  } catch (error) {
    console.error('Error fetching filter options:', error);
    res.status(500).json({ error: 'Failed to fetch filter options' });
  }
});

module.exports = router;