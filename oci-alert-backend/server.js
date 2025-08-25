

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const ociRoutes = require('./routes/oci');
const graylogRoutes = require('./routes/graylog');
const authRoutes = require('./routes/auth');
const { authenticateJWT } = require('./utils/authMiddleware');
// Auth routes (unprotected)
app.use('/auth', authRoutes);

// Protected routes
app.use('/oci-alerts', authenticateJWT, ociRoutes);
app.use('/graylog-alerts', authenticateJWT, graylogRoutes);

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

// Initialize SQLite database for auth
const sqliteDbPath = process.env.SQLITE_DB_PATH || path.join(__dirname, 'auth.db');
const sqliteDb = new sqlite3.Database(sqliteDbPath, (err) => {
  if (err) {
    console.error('❌ Failed to connect to SQLite:', err.message);
    return;
  }
  console.log('✅ Connected to SQLite auth database at', sqliteDbPath);
});

// Create table if not exists
sqliteDb.serialize(() => {
  sqliteDb.run(
    `CREATE TABLE IF NOT EXISTS ALERTS_USERPROFILE (
      USER_ID TEXT PRIMARY KEY,
      USER_PSWD TEXT NOT NULL,
      USER_ALERTS_ACCESS TEXT NOT NULL,
      CREATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP
    );`
  );

  // Expire users older than 1 day on startup
  sqliteDb.run(
    `DELETE FROM ALERTS_USERPROFILE 
     WHERE CREATED_AT <= datetime('now', '-1 day');`
  );
});

// Expose db to routes via app locals
app.locals.sqliteDb = sqliteDb;
