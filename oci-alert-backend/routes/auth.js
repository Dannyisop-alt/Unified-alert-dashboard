const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { authenticateJWT, requireAdmin } = require('../utils/authMiddleware');

const router = express.Router();

const PASSWORD_REGEX = /^(?=(?:.*[A-Z]){2,})(?=(?:.*[a-z]){2,})(?=(?:.*\d){2,})(?=(?:.*[^A-Za-z\d]){2,}).{12,}$/;
// Disallow these substrings in any casing
const PASSWORD_BLACKLIST = ['hbss', 'qyryde'];
const VALID_ACCESS = new Set([
  'Infrastructure Alerts',
  'Application Logs',
  'Application Heartbeat',
]);

function validateAccessList(accessCsv) {
  if (typeof accessCsv !== 'string' || accessCsv.trim() === '') return false;
  if (accessCsv.length > 255) return false;
  const values = accessCsv.split(',').map((s) => s.trim()).filter(Boolean);
  if (values.length === 0) return false;
  for (const v of values) {
    if (!VALID_ACCESS.has(v)) return false;
  }
  return true;
}

// PUBLIC LOGIN ROUTE - Only available route for non-authenticated users
router.post('/login', async (req, res) => {
  try {
    console.log('🔐 [LOGIN] Starting login process...');
    const db = req.app.locals.sqliteDb;
    const { email, password } = req.body || {};
    
    console.log(`📧 [LOGIN] Email: ${email}`);
    console.log(`🔑 [LOGIN] Password: ${password ? password.substring(0, 3) + '***' : 'undefined'}`);
    
    if (!email || !password) {
      console.log('❌ [LOGIN] Missing email or password');
      return res.status(400).json({ error: 'email and password are required' });
    }

    const selectSql = `SELECT USER_ID, USER_PSWD, USER_ALERTS_ACCESS, USER_ROLE FROM ALERTS_USERPROFILE WHERE USER_ID = ?`;
    console.log(`🔍 [SQLITE] Executing query: ${selectSql}`);
    console.log(`🔍 [SQLITE] Query parameters: [${email}]`);
    
    db.get(selectSql, [email], async (err, row) => {
      if (err) {
        console.error('❌ [SQLITE] Select error:', err);
        return res.status(500).json({ error: 'Failed to login' });
      }
      
      if (!row) {
        console.log('❌ [LOGIN] User not found in database');
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      console.log('👤 [LOGIN] User found:', row.USER_ID);
      console.log('🔐 [LOGIN] Stored password hash:', row.USER_PSWD.substring(0, 10) + '...');
      console.log('🔍 [LOGIN] Comparing passwords...');

      const match = await bcrypt.compare(password, row.USER_PSWD);
      if (!match) {
        console.log('❌ [LOGIN] Password comparison failed');
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      console.log('✅ [LOGIN] Password comparison successful');
//      const accessArray = row.USER_ALERTS_ACCESS.split(',').map((s) => s.trim()).filter(Boolean);
      const accessArray = row.USER_ALERTS_ACCESS
  ? row.USER_ALERTS_ACCESS.split(',').map((s) => s.trim()).filter(Boolean)
  : [];

      console.log('🎫 [LOGIN] User access:', accessArray);
      
      const token = jwt.sign(
        { 
          email: row.USER_ID, 
          access: accessArray,
          role: row.USER_ROLE || 'user'
        },
        process.env.JWT_SECRET,
        { expiresIn: '12h' }
      );

      console.log('✅ [LOGIN] JWT token created successfully');
      console.log('🎉 [LOGIN] Login successful for user:', row.USER_ID);

      return res.json({
        token,
        access: accessArray,
        role: row.USER_ROLE || 'user'
      });
    });
  } catch (error) {
    console.error('❌ [LOGIN] Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ADMIN-ONLY ROUTES - All protected by requireAdmin middleware

// Create new user - ADMIN ONLY
router.post('/admin/create-user', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const db = req.app.locals.sqliteDb;
    const { email, password, access } = req.body || {};

    if (!email || !password || !access) {
      return res.status(400).json({ error: 'email, password, and access are required' });
    }

    // Validate password strength and blacklist
    const lower = String(password || '').toLowerCase();
    const containsBlacklisted = PASSWORD_BLACKLIST.some((w) => lower.includes(w));
    if (containsBlacklisted) {
      return res.status(400).json({ error: 'hbss,qyryde not allowed in password' });
    }
    if (!PASSWORD_REGEX.test(password)) {
      return res.status(400).json({
        error: 'Password does not meet complexity requirements',
      });
    }

    if (!validateAccessList(access)) {
      return res.status(400).json({ error: 'Invalid access list' });
    }

    const saltRounds = 10;
    const hashed = await bcrypt.hash(password, saltRounds);

    const insertSql = `INSERT INTO ALERTS_USERPROFILE (USER_ID, USER_PSWD, USER_ALERTS_ACCESS, USER_ROLE) VALUES (?, ?, ?, ?)`;
    db.run(insertSql, [email, hashed, access, 'user'], function (err) {
      if (err) {
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ error: 'User already exists' });
        }
        console.error('SQLite insert error:', err);
        return res.status(500).json({ error: 'Failed to create user' });
      }
      return res.status(201).json({ message: 'User created successfully' });
    });
  } catch (error) {
    console.error('Create user error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user details - ADMIN ONLY
router.get('/admin/user/:userId', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const db = req.app.locals.sqliteDb;
    const { userId } = req.params;

    const selectSql = `SELECT USER_ID, USER_ALERTS_ACCESS, USER_ROLE, CREATED_AT FROM ALERTS_USERPROFILE WHERE USER_ID = ?`;
    db.get(selectSql, [userId], (err, row) => {
      if (err) {
        console.error('SQLite select error:', err);
        return res.status(500).json({ error: 'Failed to fetch user' });
      }
      if (!row) {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.json({
        email: row.USER_ID,
        access: row.USER_ALERTS_ACCESS.split(',').map(s => s.trim()).filter(Boolean),
        role: row.USER_ROLE,
        createdAt: row.CREATED_AT
      });
    });
  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user - ADMIN ONLY
router.put('/admin/user/:userId', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const db = req.app.locals.sqliteDb;
    const { userId } = req.params;
    const { password, access } = req.body || {};

    // Validate inputs
    if (password) {
      const lower = String(password).toLowerCase();
      const containsBlacklisted = PASSWORD_BLACKLIST.some((w) => lower.includes(w));
      if (containsBlacklisted) {
        return res.status(400).json({ error: 'hbss,qyryde not allowed in password' });
      }
    }
    if (password && !PASSWORD_REGEX.test(password)) {
      return res.status(400).json({
        error: 'Password does not meet complexity requirements',
      });
    }

    if (access && !validateAccessList(access)) {
      return res.status(400).json({ error: 'Invalid access list' });
    }

    // Check if user exists and is not admin
    const checkSql = `SELECT USER_ROLE FROM ALERTS_USERPROFILE WHERE USER_ID = ?`;
    db.get(checkSql, [userId], async (err, row) => {
      if (err) {
        console.error('SQLite select error:', err);
        return res.status(500).json({ error: 'Failed to check user' });
      }
      if (!row) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (row.USER_ROLE === 'admin') {
        return res.status(403).json({ error: 'Cannot modify admin account' });
      }

      // Build update query dynamically
      const updates = [];
      const values = [];

      if (password) {
        const hashed = await bcrypt.hash(password, 10);
        updates.push('USER_PSWD = ?');
        values.push(hashed);
      }

      if (access) {
        updates.push('USER_ALERTS_ACCESS = ?');
        values.push(access);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      values.push(userId);
      const updateSql = `UPDATE ALERTS_USERPROFILE SET ${updates.join(', ')} WHERE USER_ID = ?`;

      db.run(updateSql, values, function (err) {
        if (err) {
          console.error('SQLite update error:', err);
          return res.status(500).json({ error: 'Failed to update user' });
        }
        return res.json({ message: 'User updated successfully' });
      });
    });
  } catch (error) {
    console.error('Update user error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// List all users - ADMIN ONLY
router.get('/admin/users', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const db = req.app.locals.sqliteDb;

    const selectSql = `SELECT USER_ID, USER_ALERTS_ACCESS, USER_ROLE, CREATED_AT FROM ALERTS_USERPROFILE ORDER BY CREATED_AT DESC`;
    db.all(selectSql, [], (err, rows) => {
      if (err) {
        console.error('SQLite select error:', err);
        return res.status(500).json({ error: 'Failed to fetch users' });
      }

      const users = rows.map(row => ({
        email: row.USER_ID,
        access: row.USER_ALERTS_ACCESS.split(',').map(s => s.trim()).filter(Boolean),
        role: row.USER_ROLE,
        createdAt: row.CREATED_AT
      }));

      return res.json(users);
    });
  } catch (error) {
    console.error('List users error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete user - ADMIN ONLY
router.delete('/admin/user/:userId', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const db = req.app.locals.sqliteDb;
    const { userId } = req.params;

    // Check if user exists and is not admin
    const checkSql = `SELECT USER_ROLE FROM ALERTS_USERPROFILE WHERE USER_ID = ?`;
    db.get(checkSql, [userId], (err, row) => {
      if (err) {
        console.error('SQLite select error:', err);
        return res.status(500).json({ error: 'Failed to check user' });
      }
      if (!row) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (row.USER_ROLE === 'admin') {
        return res.status(403).json({ error: 'Cannot delete admin account' });
      }

      const deleteSql = `DELETE FROM ALERTS_USERPROFILE WHERE USER_ID = ?`;
      db.run(deleteSql, [userId], function (err) {
        if (err) {
          console.error('SQLite delete error:', err);
          return res.status(500).json({ error: 'Failed to delete user' });
        }
        return res.json({ message: 'User deleted successfully' });
      });
    });
  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// REMOVED: The old /register route is completely removed
// No way to access user registration without admin authentication

module.exports = router;
