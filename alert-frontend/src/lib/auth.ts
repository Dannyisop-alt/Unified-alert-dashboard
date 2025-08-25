export type UserAccess = 'Infrastructure Alerts' | 'Application Logs' | 'Application Heartbeat';

const TOKEN_KEY = 'auth_token';
const ACCESS_KEY = 'auth_access';
const EMAIL_KEY = 'auth_email';

export function saveAuth(token: string, access: string[], email?: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ACCESS_KEY, JSON.stringify(access));
  if (email) localStorage.setItem(EMAIL_KEY, email);
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(EMAIL_KEY);
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

export function isAuthenticated(): boolean {
  return !!getToken();
}


