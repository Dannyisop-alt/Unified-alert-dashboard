

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const ociRoutes = require('./routes/oci');
const graylogRoutes = require('./routes/graylog');
app.use('/oci-alerts', ociRoutes);
app.use('/graylog-alerts', graylogRoutes);

// Root test
app.get('/', (req, res) => res.send('🚀 Server is up and running'));

// Mongo connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  })
  .catch((error) => console.error('❌ MongoDB connection error:', error));
