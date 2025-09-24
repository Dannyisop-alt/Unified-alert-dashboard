const jwt = require('jsonwebtoken');

function authenticateJWT(req, res, next) {
  console.log('\n🔐 [JWT] Starting JWT authentication...');
  const authHeader = req.headers['authorization'] || '';
  console.log(`📥 [JWT] Authorization header: ${authHeader.substring(0, 20)}...`);
  
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    console.log('❌ [JWT] Missing authorization token');
    return res.status(401).json({ error: 'Missing authorization token' });
  }
  
  console.log(`🎫 [JWT] Token: ${token.substring(0, 50)}...`);
  
  try {
    const jwtSecret = process.env.JWT_SECRET || 'change_this_secret';
    console.log(`🔐 [JWT] Secret: ${jwtSecret.substring(0, 10)}...`);
    
    const payload = jwt.verify(token, jwtSecret);
    console.log(`👤 [JWT] Token payload: ${JSON.stringify(payload)}`);
    
    req.user = payload;
    console.log('✅ [JWT] Authentication successful');
    return next();
  } catch (err) {
    console.log(`❌ [JWT] Token verification failed: ${err.message}`);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// NEW: Admin-only middleware
function requireAdmin(req, res, next) {
  // This middleware should be used AFTER authenticateJWT
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      error: 'Access denied. Administrator privileges required.' 
    });
  }
  
  return next();
}

module.exports = { 
  authenticateJWT, 
  requireAdmin 
};