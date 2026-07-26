const TOKEN_KEY = 'gozone_admin_token';
const REFRESH_KEY = 'gozone_admin_refresh';
const ROLE_KEY = 'gozone_admin_role';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}
export function getRole(): string | null {
  return localStorage.getItem(ROLE_KEY);
}

/**
 * Store a session. The refresh token is kept because access tokens are short-lived (1h) —
 * without it an operator would be thrown back to the login screen mid-review every hour.
 */
export function setAuth(token: string, role: string, refreshToken?: string | null) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ROLE_KEY, role);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  window.dispatchEvent(new Event('gozone-auth-changed'));
}

/** Replace just the tokens after a silent refresh (role and login state are unchanged). */
export function setTokens(token: string, refreshToken: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(ROLE_KEY);
  window.dispatchEvent(new Event('gozone-auth-changed'));
}
