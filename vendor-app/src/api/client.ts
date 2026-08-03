import axios from 'axios';
import { storage } from '../lib/storage';
import { apiBaseUrl } from '../lib/host';

// Gateway URL derived live from the laptop's current IP (see lib/host).
const BASE_URL = apiBaseUrl();

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach stored access token to every request (guarded — never throws).
api.interceptors.request.use(async (config) => {
  const token = await storage.get('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Swap the refresh token for a fresh pair — at most one call at a time.
 *
 * The server revokes a refresh token the instant it is used, so two refreshes running together mean
 * the second presents an already-revoked token and fails. That is easy to provoke here: the driver
 * feed polls every 5s alongside a wallet call and fetchMe, so one expiring access token can produce
 * three simultaneous 401s. Without this guard the losers of that race clear the session and the
 * driver is silently logged out mid-shift.
 *
 * Resolves to the new access token, or null when there is no refresh token to spend.
 */
let inFlight: Promise<string | null> | null = null;

export function refreshSession(): Promise<string | null> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const refreshToken = await storage.get('refreshToken');
    if (!refreshToken) return null;
    // Bare axios on purpose: `api` would attach the dead access token and recurse back through
    // the interceptor below.
    const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
    await storage.set('accessToken', data.accessToken);
    await storage.set('refreshToken', data.refreshToken);
    return data.accessToken as string;
  })().finally(() => { inFlight = null; });
  return inFlight;
}

/**
 * 401 means the access token is dead. 403 usually means it is *stale*.
 *
 * `status` is stamped into the token when it is minted, and the token lives an hour — so a driver who
 * signed in while PENDING still carries STATUS_PENDING after an admin approves them. /auth/me reads
 * the database and reports ACTIVE, so the app drops its "under review" screen and starts polling,
 * straight into 403s from every endpoint gated on STATUS_ACTIVE. Re-minting the token is precisely
 * the fix, so spend one attempt on it. A genuine 403 — someone else's trip, someone else's document —
 * simply 403s again one round trip later, which is the right answer either way.
 */
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const original = error.config;
    if ((status === 401 || status === 403) && original && !original._retry) {
      original._retry = true;
      try {
        const token = await refreshSession();
        if (!token) throw new Error('No refresh token');
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        // Only a failed 401 ends the session. Clearing tokens on a 403 would log someone out for
        // touching a resource that was never theirs to read.
        if (status === 401) {
          await storage.remove('accessToken');
          await storage.remove('refreshToken');
        }
      }
    }
    return Promise.reject(error);
  },
);

export default api;
