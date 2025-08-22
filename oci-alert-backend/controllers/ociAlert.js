const OCIAlert = require('../models/OciAlert');
const ociService = require('../services/ociService'); // New service to handle OCI logic

/**
 * Fetches alerts from the Oracle Cloud Infrastructure (OCI) Monitoring API
 * and saves them to the database.
 */
exports.fetchAndSaveAlerts = async (req, res) => {
  try {
    const alerts = await ociService.getOCIAlerts(); // Get real alerts from the OCI service
    
    // Process and save alerts to the database
    // FIX: Change 'const' to 'let' to allow reassignment inside the loop
    let savedCount = 0;
    for (const alertData of alerts) {
      // Check for duplicates before saving
      const existingAlert = await OCIAlert.findOne({
        message: alertData.message,
        vm: alertData.vm,
        timestamp: alertData.timestamp
      });
      
      if (!existingAlert) {
        const newAlert = new OCIAlert(alertData);
        await newAlert.save();
        savedCount++;
      }
    }
    
    res.status(200).send({
      message: 'Alerts fetched and saved successfully.',
      count: savedCount,
    });
    
  } catch (error) {
    console.error('Error fetching and saving alerts:', error);
    res.status(500).send({
      message: 'Failed to fetch and save alerts.',
      error: error.message,
    });
  }
};

/**
 * Retrieves all alerts from the database.
 */
exports.getAlerts = async (req, res) => {
  try {
    const alerts = await OCIAlert.find().sort({ timestamp: -1 });
    res.status(200).json(alerts);
  } catch (error) {
    console.error('Error retrieving alerts:', error);
    res.status(500).send({
      message: 'Failed to retrieve alerts.',
      error: error.message,
    });
  }
};

/**
 * Marks an alert as read.
 */
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const alert = await OCIAlert.findByIdAndUpdate(id, { read: true }, { new: true });
    if (!alert) {
      return res.status(404).send({ message: 'Alert not found.' });
    }
    res.status(200).json(alert);
  } catch (error) {
    console.error('Error marking alert as read:', error);
    res.status(500).send({
      message: 'Failed to mark alert as read.',
      error: error.message,
    });
  }
};

/**
 * Marks an alert as acknowledged.
 */
exports.markAsAcknowledged = async (req, res) => {
  try {
    const { id } = req.params;
    const alert = await OCIAlert.findByIdAndUpdate(id, { acknowledged: true }, { new: true });
    if (!alert) {
      return res.status(404).send({ message: 'Alert not found.' });
    }
    res.status(200).json(alert);
  } catch (error) {
    console.error('Error marking alert as acknowledged:', error);
    res.status(500).send({
      message: 'Failed to mark alert as acknowledged.',
      error: error.message,
    });
  }
};
