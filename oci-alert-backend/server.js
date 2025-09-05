const express = require('express');
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

// Import routes
const ociRoutes = require('./routes/oci');
const graylogRoutes = require('./routes/graylog');
const authRoutes = require('./routes/auth');
const { authenticateJWT } = require('./utils/authMiddleware');

// Auth routes (unprotected)
app.use('/auth', authRoutes);

// Graylog alerts (unprotected - no auth required)
app.use('/graylog-alerts', graylogRoutes);

// Protected routes
app.use('/oci-alerts', authenticateJWT, ociRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    mode: 'Memory List Storage',
    storage: 'Unlimited Memory List',
    resetSchedule: 'Daily at 12:05 AM'
  });
});

// Root test
app.get('/', (req, res) => res.send('🚀 Server is up and running'));

// Start server (no MongoDB dependency)
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Password validation function
const PASSWORD_REGEX = /^(?=(?:.*[A-Z]){2,})(?=(?:.*[a-z]){2,})(?=(?:.*\d){2,})(?=(?:.*[^A-Za-z\d]){2,}).{12,}$/;
const PASSWORD_BLACKLIST = ['hbss', 'qyryde'];

function validateAdminPassword(password) {
  if (!password) return { valid: false, error: 'Password is required' };
  
  const lower = String(password).toLowerCase();
  const containsBlacklisted = PASSWORD_BLACKLIST.some((w) => lower.includes(w));
  if (containsBlacklisted) {
    return { valid: false, error: 'Password contains blacklisted substrings: hbss, qyryde' };
  }
  
  if (!PASSWORD_REGEX.test(password)) {
    return { 
      valid: false, 
      error: 'Password must have: 2+ uppercase, 2+ lowercase, 2+ digits, 2+ special chars, 12+ length' 
    };
  }
  
  return { valid: true };
}

// Initialize SQLite database for auth - CHANGED TO users.sqlite
const sqliteDbPath = process.env.SQLITE_DB_PATH || path.join(__dirname, 'users.sqlite');
const sqliteDb = new sqlite3.Database(sqliteDbPath, (err) => {
  if (err) {
    console.error('❌ Failed to connect to SQLite:', err.message);
    return;
  }
  // Connected to SQLite auth database
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
  
  // Validate admin password
  const passwordValidation = validateAdminPassword(adminPassword);
  if (!passwordValidation.valid) {
    console.error('❌ Invalid admin password:', passwordValidation.error);
    console.error('❌ Please update ADMIN_PASSWORD in docker-compose.yml with a valid password');
    return;
  }
  
  // Admin credentials validated
  
  // Check if admin exists and update password if needed
  sqliteDb.get(
    `SELECT USER_ID, USER_PSWD FROM ALERTS_USERPROFILE WHERE USER_ROLE = 'admin'`,
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
                // Admin account created successfully
              }
            }
          );
        } catch (hashError) {
          console.error('❌ Failed to hash admin password:', hashError.message);
        }
      } else {
        // Admin exists, verify password matches current environment
        const passwordMatch = await bcrypt.compare(adminPassword, row.USER_PSWD);
        if (!passwordMatch) {
          // Updating admin password
          try {
            const hashedPassword = await bcrypt.hash(adminPassword, 10);
            sqliteDb.run(
              `UPDATE ALERTS_USERPROFILE SET USER_PSWD = ? WHERE USER_ID = ?`,
              [hashedPassword, adminUsername],
              function(err) {
                if (err) {
                  console.error('❌ Failed to update admin password:', err.message);
                } else {
                  // Admin password updated successfully
                }
              }
            );
          } catch (hashError) {
            console.error('❌ Failed to hash admin password:', hashError.message);
          }
        } else {
          // Admin account ready
        }
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

// DEBUG: List all users endpoint
app.get('/debug/users', (req, res) => {
  sqliteDb.all('SELECT USER_ID, USER_ROLE, CREATED_AT FROM ALERTS_USERPROFILE', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// DEBUG: Reset admin user endpoint
app.post('/debug/reset-admin', async (req, res) => {
  try {
    const adminUsername = process.env.ADMIN_USERNAME || 'admin@company.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'AdminPass123!@#';
    
    // Validate password before reset
    const passwordValidation = validateAdminPassword(adminPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({ 
        error: 'Invalid admin password', 
        details: passwordValidation.error 
      });
    }
    
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    sqliteDb.run(
      'DELETE FROM ALERTS_USERPROFILE WHERE USER_ID = ?',
      [adminUsername],
      (err) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        sqliteDb.run(
          'INSERT INTO ALERTS_USERPROFILE (USER_ID, USER_PSWD, USER_ALERTS_ACCESS, USER_ROLE) VALUES (?, ?, ?, ?)',
          [adminUsername, hashedPassword, 'Infrastructure Alerts,Application Logs,Application Heartbeat', 'admin'],
          (err) => {
            if (err) {
              return res.status(500).json({ error: err.message });
            }
            res.json({ 
              message: 'Admin user reset successfully', 
              username: adminUsername,
              password: adminPassword,
              note: 'Password follows complexity rules'
            });
          }
        );
      }
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
