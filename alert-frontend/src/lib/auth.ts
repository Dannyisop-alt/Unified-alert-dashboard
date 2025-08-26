export type UserAccess = 'Infrastructure Alerts' | 'Application Logs' | 'Application Heartbeat';
export type UserRole = 'admin' | 'user';

const TOKEN_KEY = 'auth_token';
const ACCESS_KEY = 'auth_access';
const EMAIL_KEY = 'auth_email';
const ROLE_KEY = 'auth_role';

export function saveAuth(token: string, access: string[], email?: string, role?: UserRole) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ACCESS_KEY, JSON.stringify(access));
  if (email) localStorage.setItem(EMAIL_KEY, email);
  if (role) localStorage.setItem(ROLE_KEY, role);
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(EMAIL_KEY);
  localStorage.removeItem(ROLE_KEY);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getAccess(): UserAccess[] {
  const raw = localStorage.getItem(ACCESS_KEY);
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getRole(): UserRole {
  return (localStorage.getItem(ROLE_KEY) as UserRole) || 'user';
}

export function getEmail(): string | null {
  return localStorage.getItem(EMAIL_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function isAdmin(): boolean {
  return getRole() === 'admin';
}

