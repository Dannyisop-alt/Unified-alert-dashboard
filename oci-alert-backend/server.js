const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

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

// Initialize SQLite database for auth - CHANGED TO users.sqlite
const sqliteDbPath = process.env.SQLITE_DB_PATH || path.join(__dirname, 'users.sqlite');
const sqliteDb = new sqlite3.Database(sqliteDbPath, (err) => {
  if (err) {
    console.error('❌ Failed to connect to SQLite:', err.message);
    return;
  }
  console.log('✅ Connected to SQLite auth database at', sqliteDbPath);
});

// Create table if not exists - UPDATED WITH ROLE COLUMN
sqliteDb.serialize(() => {
  sqliteDb.run(
    `CREATE TABLE IF NOT EXISTS ALERTS_USERPROFILE (
      USER_ID TEXT PRIMARY KEY,
      USER_PSWD TEXT NOT NULL,
      USER_ALERTS_ACCESS TEXT NOT NULL,
      USER_ROLE TEXT NOT NULL DEFAULT 'user',
      CREATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP
    );`
  );

  // Add USER_ROLE column if it doesn't exist (for existing databases)
  sqliteDb.run(
    `ALTER TABLE ALERTS_USERPROFILE ADD COLUMN USER_ROLE TEXT DEFAULT 'user';`,
    (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding USER_ROLE column:', err.message);
      }
    }
  );

  // SEED ADMIN ACCOUNT
  const adminUsername = process.env.ADMIN_USERNAME || 'admin@company.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'AdminPass123!@#';
  
  // Check if admin exists
  sqliteDb.get(
    `SELECT USER_ID FROM ALERTS_USERPROFILE WHERE USER_ROLE = 'admin'`,
    async (err, row) => {
      if (err) {
        console.error('Error checking for admin:', err.message);
        return;
      }
      
      if (!row) {
        // Create admin account
        try {
          const hashedPassword = await bcrypt.hash(adminPassword, 10);
          sqliteDb.run(
            `INSERT INTO ALERTS_USERPROFILE (USER_ID, USER_PSWD, USER_ALERTS_ACCESS, USER_ROLE) VALUES (?, ?, ?, ?)`,
            [adminUsername, hashedPassword, 'Infrastructure Alerts,Application Logs,Application Heartbeat', 'admin'],
            function(err) {
              if (err) {
                console.error('❌ Failed to create admin account:', err.message);
              } else {
                console.log('✅ Admin account created successfully');
                console.log('📧 Admin Username:', adminUsername);
                console.log('🔑 Admin Password:', adminPassword);
                console.log('⚠️  Please change the default admin password!');
              }
            }
          );
        } catch (hashError) {
          console.error('❌ Failed to hash admin password:', hashError.message);
        }
      } else {
        console.log('✅ Admin account already exists');
      }
    }
  );

  // Expire regular users older than 1 day on startup (keep admin permanently)
  sqliteDb.run(
    `DELETE FROM ALERTS_USERPROFILE 
     WHERE CREATED_AT <= datetime('now', '-1 day') AND USER_ROLE != 'admin';`
  );
});

// Expose db to routes via app locals
app.locals.sqliteDb = sqliteDb;