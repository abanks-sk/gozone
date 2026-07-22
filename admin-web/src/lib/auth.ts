const TOKEN_KEY = 'gozone_admin_token';
const ROLE_KEY = 'gozone_admin_role';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function getRole(): string | null {
  return localStorage.getItem(ROLE_KEY);
}
export function setAuth(token: string, role: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ROLE_KEY, role);
  window.dispatchEvent(new Event('gozone-auth-changed'));
}
export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
  window.dispatchEvent(new Event('gozone-auth-changed'));
}
