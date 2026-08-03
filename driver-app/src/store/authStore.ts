import { create } from 'zustand';
import api, { refreshSession } from '../api/client';
import { storage } from '../lib/storage';
import { clearUserData } from '../lib/session';

/** The server-side profile (`GET /auth/me`) — the source of truth for account details. */
export interface MeProfile {
  status: string | null;
  name: string | null;
  username: string | null;
  email: string | null;
  phone: string | null;
  vehicleClass: string | null;
  serviceMode: string | null;
}

const EMPTY_ME: MeProfile = {
  status: null, name: null, username: null, email: null, phone: null,
  vehicleClass: null, serviceMode: null,
};

interface AuthState {
  userId: string | null;
  role: string | null;
  name: string | null;
  status: string | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  /** True once hydrate() has finished — used to avoid redirecting before tokens load. */
  hydrated: boolean;

  vehicleClass: string | null;
  serviceMode: string | null;

  register: (phone: string, role: string, name?: string, vehicleClass?: string, username?: string) => Promise<void>;
  login: (phone: string) => Promise<void>;
  registerEmail: (email: string, role: string, name?: string, vehicleClass?: string) => Promise<void>;
  loginEmail: (email: string) => Promise<void>;
  verifyOtp: (phone: string, code: string) => Promise<void>;
  verifyEmailOtp: (email: string, code: string) => Promise<void>;
  /** Log in with a verified email + password. */
  loginEmailPassword: (email: string, password: string) => Promise<void>;
  /** Settings: step 1 — attach an email + password, emails a verification code. */
  startAddEmail: (email: string, password: string) => Promise<void>;
  /** Settings: step 2 — confirm the emailed code. */
  verifyAddEmail: (email: string, code: string) => Promise<void>;
  /** Account: step 1 — a code is texted to the new number. */
  startAddPhone: (phone: string) => Promise<void>;
  /** Account: step 2 — confirm the code; the verified number replaces the old one. */
  verifyAddPhone: (phone: string, code: string) => Promise<void>;
  fetchMe: () => Promise<MeProfile>;
  /** Save editable account fields (name / username) to the backend. */
  updateProfile: (fields: { name?: string; username?: string }) => Promise<MeProfile>;
  setServiceMode: (mode: string) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: null,
  role: null,
  name: null,
  status: null,
  vehicleClass: null,
  serviceMode: null,
  accessToken: null,
  isAuthenticated: false,
  hydrated: false,

  register: async (phone, role, name, vehicleClass, username) => {
    await api.post('/auth/register', { phone, role, name, vehicleClass, username });
    // OTP printed to server logs in dev
  },

  login: async (phone) => {
    // Login-only: the backend 404s (no account created) if this phone isn't registered.
    await api.post('/auth/login', { phone });
    // OTP printed to server logs in dev
  },

  registerEmail: async (email, role, name, vehicleClass) => {
    await api.post('/auth/register-email', { email, role, name, vehicleClass });
  },

  loginEmail: async (email) => {
    // Login-only: 404s if this email isn't registered (never creates an account).
    await api.post('/auth/login-email', { email });
  },

  loginEmailPassword: async (email, password) => {
    const { data } = await api.post('/auth/login-email-password', { email, password });
    await applySession(set, data);
  },

  startAddEmail: async (email, password) => {
    await api.post('/auth/me/email', { email, password });
  },

  verifyAddEmail: async (email, code) => {
    await api.post('/auth/me/email/verify', { email, code });
  },

  startAddPhone: async (phone) => {
    await api.post('/auth/me/phone', { phone });
  },

  verifyAddPhone: async (phone, code) => {
    await api.post('/auth/me/phone/verify', { phone, code });
  },

  fetchMe: async () => {
    try {
      const { data } = await api.get('/auth/me');
      const me = toProfile(data);
      // The token carries the status it was minted with. When an admin approves the account the
      // database changes but the token in hand still reads PENDING, and every endpoint gated on
      // STATUS_ACTIVE keeps refusing — the feed's "Forbidden" with no way out. Re-mint as soon as
      // this call notices the disagreement, so the app opens up on the poll that saw the approval
      // rather than an hour later when the token happens to expire.
      if (me.status && me.status !== (await tokenStatus())) {
        await refreshSession().catch(() => {});
      }
      set({ status: me.status, name: me.name, vehicleClass: me.vehicleClass, serviceMode: me.serviceMode });
      return me;
    } catch {
      return { ...EMPTY_ME };
    }
  },

  // Errors are deliberately not swallowed here — the account screen shows the server's
  // message (e.g. "That username is already taken.").
  updateProfile: async (fields) => {
    const { data } = await api.patch('/auth/me', fields);
    const me = toProfile(data);
    set({ name: me.name });
    return me;
  },

  setServiceMode: async (mode) => {
    const { data } = await api.patch('/auth/me/service-mode', { mode });
    set({ serviceMode: data.serviceMode });
  },

  verifyOtp: async (phone, code) => {
    const { data } = await api.post('/auth/verify-otp', { phone, code });
    await applySession(set, data);
  },

  verifyEmailOtp: async (email, code) => {
    const { data } = await api.post('/auth/verify-otp', { email, code });
    await applySession(set, data);
  },

  logout: async () => {
    // Revoke the refresh token server-side first — dropping it locally alone would leave a
    // 7-day session resumable by anyone who captured it. Local sign-out proceeds regardless.
    try {
      const refreshToken = await storage.get('refreshToken');
      if (refreshToken) await api.post('/auth/logout', { refreshToken });
    } catch {}
    await storage.remove('accessToken');
    await storage.remove('refreshToken');
    // Wipe all user-scoped local data so the next account starts clean.
    await clearUserData();
    set({ userId: null, role: null, name: null, status: null, accessToken: null, isAuthenticated: false });
  },

  hydrate: async () => {
    try {
      const token = await storage.get('accessToken');
      if (!token) return;
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp * 1000 < Date.now()) {
        // Token expired — try to refresh
        const refresh = await storage.get('refreshToken');
        if (!refresh) return;
        const { data } = await api.post('/auth/refresh', { refreshToken: refresh });
        await storage.set('accessToken', data.accessToken);
        await storage.set('refreshToken', data.refreshToken);
        const newPayload = JSON.parse(atob(data.accessToken.split('.')[1]));
        set({
          userId: newPayload.sub,
          role: data.role,
          accessToken: data.accessToken,
          isAuthenticated: true,
        });
      } else {
        set({
          userId: payload.sub,
          role: payload.role,
          accessToken: token,
          isAuthenticated: true,
        });
      }
    } catch {
      // If hydration fails, user stays logged out
    } finally {
      set({ hydrated: true });
    }
  },
}));

/**
 * The account status the access token in hand was minted with — which is not necessarily today's
 * truth. Base64url, so the two URL-safe characters have to be mapped back before decoding.
 * Returns null if anything about the token is unreadable; the 403 retry in api/client.ts is the
 * independent second line of defence.
 */
async function tokenStatus(): Promise<string | null> {
  try {
    const token = await storage.get('accessToken');
    if (!token) return null;
    const body = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(body)).status ?? null;
  } catch {
    return null;
  }
}

function toProfile(data: any): MeProfile {
  return {
    status: data?.status ?? null,
    name: data?.name ?? null,
    username: data?.username ?? null,
    email: data?.email ?? null,
    phone: data?.phone ?? null,
    vehicleClass: data?.vehicleClass ?? null,
    serviceMode: data?.serviceMode ?? 'BOTH',
  };
}

// Persist tokens from a verify response and mark the session authenticated.
async function applySession(set: (partial: Partial<AuthState>) => void, data: any) {
  await storage.set('accessToken', data.accessToken);
  await storage.set('refreshToken', data.refreshToken);
  const payload = JSON.parse(atob(data.accessToken.split('.')[1]));
  set({
    userId: payload.sub,
    role: data.role,
    accessToken: data.accessToken,
    isAuthenticated: true,
  });
}
