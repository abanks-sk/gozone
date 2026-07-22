import { create } from 'zustand';
import { storage } from '../lib/storage';

// Driver account details — local mock (no backend profile-update API), persisted and
// user-scoped (cleared on logout/login via lib/session.ts). Seeded from /auth/me + the
// identifier used at sign-up/login.
export interface ProfileData {
  name: string;
  username: string;
  email: string;
  phone: string;
}

const DEFAULTS: ProfileData = { name: '', username: '', email: '', phone: '' };
const KEY = 'driverProfile';

interface ProfileState extends ProfileData {
  setProfile: (p: Partial<ProfileData>) => void;
  reset: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  ...DEFAULTS,
  setProfile: (p) => {
    set(p);
    const { name, username, email, phone } = { ...get(), ...p };
    storage.set(KEY, JSON.stringify({ name, username, email, phone })).catch(() => {});
  },
  reset: async () => {
    set({ ...DEFAULTS });
    await storage.remove(KEY).catch(() => {});
  },
  hydrate: async () => {
    try { const raw = await storage.get(KEY); if (raw) set(JSON.parse(raw)); } catch {}
  },
}));

export function initial(name: string): string {
  return (name.trim()[0] ?? 'D').toUpperCase();
}
