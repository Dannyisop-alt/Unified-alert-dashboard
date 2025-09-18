# Authentication Logging Guide

## 🔍 **Comprehensive Logging Added**

The system now has detailed logging at every step of the authentication process to help identify issues in production.

## 📊 **Log Categories**

### **Backend Logs (Server Console)**
- `🔍 [REQUEST]` - All incoming HTTP requests
- `🗄️ [SQLITE]` - Database operations and queries
- `👤 [ADMIN]` - Admin account creation/validation
- `🔐 [LOGIN]` - Login process details
- `🔐 [JWT]` - JWT token verification
- `📥 [HEADERS]` - Request headers and body

### **Frontend Logs (Browser Console)**
- `🔐 [LOGIN]` - Frontend login process
- `💾 [AUTH]` - Authentication data storage
- `🛡️ [PROTECTED]` - Route protection checks
- `🏗️ [API]` - API calls to backend
- `🔍 [AUTH]` - Authentication status checks

## 🔍 **How to Debug Authentication Issues**

### **1. Check Backend Logs**
```bash
# View all backend logs
docker-compose logs backend

# Follow logs in real-time
docker-compose logs -f backend
```

### **2. Check Frontend Logs**
1. Open browser Developer Tools (F12)
2. Go to Console tab
3. Look for logs starting with `[LOGIN]`, `[AUTH]`, `[PROTECTED]`, `[API]`

### **3. Check Database State**
```bash
# Access the database directly
docker exec -it oci-alert-dashboard-backend sqlite3 /app/data/users.sqlite

# List all users
SELECT USER_ID, USER_ROLE, CREATED_AT FROM ALERTS_USERPROFILE;

# Check admin user
SELECT * FROM ALERTS_USERPROFILE WHERE USER_ROLE = 'admin';
```

## 🚨 **Common Issues & What to Look For**

### **Issue 1: "Missing authorization token"**
**Backend Logs:**
```
❌ [JWT] Missing authorization token
```
**Frontend Logs:**
```
🎫 [API] Token: MISSING
```
**Solution:** Check if user is logged in, token might be expired or not saved.

### **Issue 2: "Invalid credentials"**
**Backend Logs:**
```
❌ [LOGIN] User not found in database
❌ [LOGIN] Password comparison failed
```
**Solution:** Check if admin user exists in database, verify password.

### **Issue 3: "Invalid or expired token"**
**Backend Logs:**
```
❌ [JWT] Token verification failed: [error message]
```
**Solution:** Check JWT secret, token might be expired or corrupted.

### **Issue 4: Database Connection Issues**
**Backend Logs:**
```
❌ [SQLITE] Failed to connect to SQLite: [error]
❌ [SQLITE] Select error: [error]
```
**Solution:** Check database file permissions, volume mounts.

## 📋 **Step-by-Step Debugging Process**

### **1. Check System Startup**
Look for these logs in backend:
```
🗄️ [SQLITE] Database path: /app/data/users.sqlite
✅ [SQLITE] Connected to SQLite auth database
👤 [ADMIN] Username: admin@yourcompany.com
🔐 [ADMIN] Password: Adm*** (first 3 chars)
✅ [ADMIN] Admin credentials validated
```

### **2. Test Login Process**
1. **Frontend sends login request:**
   ```
   🔐 [LOGIN] Starting frontend login process...
   📧 [LOGIN] Email: admin@yourcompany.com
   🔑 [LOGIN] Password: Adm***
   🌐 [LOGIN] API URL: http://your-domain:5001
   ```

2. **Backend receives request:**
   ```
   🔍 [REQUEST] POST /auth/login
   📥 [HEADERS] Authorization: undefined
   📦 [BODY] {"email":"admin@yourcompany.com","password":"..."}
   ```

3. **Database query:**
   ```
   🔍 [SQLITE] Executing query: SELECT USER_ID, USER_PSWD, USER_ALERTS_ACCESS, USER_ROLE FROM ALERTS_USERPROFILE WHERE USER_ID = ?
   🔍 [SQLITE] Query parameters: [admin@yourcompany.com]
   ```

4. **Password verification:**
   ```
   👤 [LOGIN] User found: admin@yourcompany.com
   🔐 [LOGIN] Stored password hash: $2b$10$...
   🔍 [LOGIN] Comparing passwords...
   ✅ [LOGIN] Password comparison successful
   ```

5. **JWT token creation:**
   ```
   🎫 [JWT] Token payload: {"email":"admin@yourcompany.com","access":["Infrastructure Alerts","Application Logs","Application Heartbeat"],"role":"admin"}
   🎫 [JWT] Token generated: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

6. **Frontend saves auth data:**
   ```
   💾 [AUTH] Saving authentication data...
   🎫 [AUTH] Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   📋 [AUTH] Access: ["Infrastructure Alerts","Application Logs","Application Heartbeat"]
   📧 [AUTH] Email: admin@yourcompany.com
   👑 [AUTH] Role: admin
   ✅ [AUTH] Authentication data saved to localStorage
   ```

### **3. Test Protected Route Access**
```
🛡️ [PROTECTED] Checking route protection...
🔒 [PROTECTED] Require admin: false
🔍 [AUTH] Checking authentication: AUTHENTICATED
🎫 [AUTH] Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
👑 [AUTH] Checking admin status: ADMIN (role: admin)
✅ [PROTECTED] User is authenticated
✅ [PROTECTED] User access granted
```

### **4. Test API Calls**
```
🏗️ [API] Fetching OCI alerts...
📋 [API] Parameters: {"limit":100}
🌐 [API] URL: http://your-domain:5001/oci-alerts?limit=100
🎫 [API] Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
📡 [API] Response status: 200
✅ [API] OCI alerts fetched: 15 alerts
```

## 🔧 **Quick Fixes**

### **Reset Admin User**
```bash
# Reset admin user via API
curl -X POST http://your-domain:5001/debug/reset-admin
```

### **Check Database**
```bash
# List all users
curl http://your-domain:5001/debug/users
```

### **Test Health**
```bash
# Check backend health
curl http://your-domain:5001/health
```

## 📞 **When to Contact Support**

If you see these patterns in logs:
- Multiple `❌ [SQLITE]` errors
- `❌ [JWT] Token verification failed` with valid tokens
- `❌ [LOGIN] User not found` when user should exist
- Database connection errors

Include the relevant log sections when reporting issues.



