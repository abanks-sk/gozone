import { create } from 'zustand';
import api from '../api/client';
import { storage } from '../lib/storage';
import { clearUserData } from '../lib/session';

/** The server-side profile (`GET /auth/me`) — the source of truth for account details. */
export interface MeProfile {
  name: string | null;
  username: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  status: string | null;
}

const EMPTY_ME: MeProfile = {
  name: null, username: null, email: null, phone: null, role: null, status: null,
};

interface AuthState {
  userId: string | null;
  role: string | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  /** True once hydrate() has finished — used to avoid redirecting before tokens load. */
  hydrated: boolean;

  register: (phone: string, role: string, name?: string, username?: string) => Promise<void>;
  login: (phone: string) => Promise<void>;
  registerEmail: (email: string, role: string, name?: string) => Promise<void>;
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
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
}

/**
 * Which app this is, sent with every auth call.
 *
 * Accounts are scoped to an app: the same number can hold a separate passenger, driver and vendor
 * account. Without this the server has to guess, and guessing is what let a passenger's number sign
 * straight into the driver app.
 */
const APP = 'PASSENGER';

export const useAuthStore = create<AuthState>((set) => ({
  userId: null,
  role: null,
  accessToken: null,
  isAuthenticated: false,
  hydrated: false,

  register: async (phone, role, name, username) => {
    await api.post('/auth/register', { phone, role, name, username, app: APP });
    // OTP printed to server logs in dev
  },

  login: async (phone) => {
    // Login-only: the backend 404s (no account created) if this phone isn't registered.
    await api.post('/auth/login', { phone, app: APP });
    // OTP printed to server logs in dev
  },

  registerEmail: async (email, role, name) => {
    await api.post('/auth/register-email', { email, role, name, app: APP });
  },

  loginEmail: async (email) => {
    // Login-only: 404s if this email isn't registered (never creates an account).
    await api.post('/auth/login-email', { email, app: APP });
  },

  verifyOtp: async (phone, code) => {
    const { data } = await api.post('/auth/verify-otp', { phone, code, app: APP });
    await applySession(set, data);
  },

  verifyEmailOtp: async (email, code) => {
    const { data } = await api.post('/auth/verify-otp', { email, code, app: APP });
    await applySession(set, data);
  },

  loginEmailPassword: async (email, password) => {
    const { data } = await api.post('/auth/login-email-password', { email, password, app: APP });
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
      return toProfile(data);
    } catch {
      return { ...EMPTY_ME };
    }
  },

  // Errors are deliberately not swallowed here — the account screen shows the server's
  // message (e.g. "That username is already taken.").
  updateProfile: async (fields) => {
    const { data } = await api.patch('/auth/me', fields);
    return toProfile(data);
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
    set({ userId: null, role: null, accessToken: null, isAuthenticated: false });
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

function toProfile(data: any): MeProfile {
  return {
    name: data?.name ?? null,
    username: data?.username ?? null,
    email: data?.email ?? null,
    phone: data?.phone ?? null,
    role: data?.role ?? null,
    status: data?.status ?? null,
  };
}

// Persist tokens from a verify/refresh response and mark the session authenticated.
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
