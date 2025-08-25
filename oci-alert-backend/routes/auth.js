const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const router = express.Router();

const PASSWORD_REGEX = /^(?=(?:.*[A-Z]){2,})(?=(?:.*[a-z]){2,})(?=(?:.*\d){2,})(?=(?:.*[^A-Za-z\d]){2,}).{12,}$/;
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

router.post('/register', async (req, res) => {
  try {
    const db = req.app.locals.sqliteDb;
    const { email, password, access } = req.body || {};

    if (!email || !password || !access) {
      return res.status(400).json({ error: 'email, password, and access are required' });
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

    const insertSql = `INSERT INTO ALERTS_USERPROFILE (USER_ID, USER_PSWD, USER_ALERTS_ACCESS) VALUES (?, ?, ?)`;
    db.run(insertSql, [email, hashed, access], function (err) {
      if (err) {
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ error: 'User already exists' });
        }
        console.error('SQLite insert error:', err);
        return res.status(500).json({ error: 'Failed to register user' });
      }
      return res.status(201).json({ message: 'User registered successfully' });
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const db = req.app.locals.sqliteDb;
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const selectSql = `SELECT USER_ID, USER_PSWD, USER_ALERTS_ACCESS FROM ALERTS_USERPROFILE WHERE USER_ID = ?`;
    db.get(selectSql, [email], async (err, row) => {
      if (err) {
        console.error('SQLite select error:', err);
        return res.status(500).json({ error: 'Failed to login' });
      }
      if (!row) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const match = await bcrypt.compare(password, row.USER_PSWD);
      if (!match) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const accessArray = row.USER_ALERTS_ACCESS.split(',').map((s) => s.trim()).filter(Boolean);
      const token = jwt.sign(
        { email: row.USER_ID, access: accessArray },
        process.env.JWT_SECRET || 'change_this_secret',
        { expiresIn: '12h' }
      );

      return res.json({
        token,
        access: accessArray,
      });
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;


