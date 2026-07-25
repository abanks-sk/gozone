import { create } from 'zustand';
import { storage } from '../lib/storage';

// A local cache of the vendor owner's personal server profile (GET/PATCH /auth/me),
// persisted and user-scoped (cleared on logout/login via lib/session.ts). This is the
// person, not the business — the shop's own details live in businessStore/vendorStore.
// auth-service is the source of truth.
export interface ProfileData {
  name: string;
  username: string;
  email: string;
  phone: string;
}

const DEFAULTS: ProfileData = { name: '', username: '', email: '', phone: '' };
const KEY = 'vendorProfile';

/** The subset of `GET /auth/me` this cache mirrors (nulls mean "not set on the account"). */
export interface ServerProfile {
  name?: string | null;
  username?: string | null;
  email?: string | null;
  phone?: string | null;
}

interface ProfileState extends ProfileData {
  setProfile: (p: Partial<ProfileData>) => void;
  /** Overwrite the cache with what the server just returned. */
  setFromServer: (me: ServerProfile) => void;
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
  setFromServer: (me) => {
    get().setProfile({
      name: me.name ?? '',
      username: me.username ?? '',
      email: me.email ?? '',
      phone: me.phone ?? '',
    });
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
  return (name.trim()[0] ?? 'V').toUpperCase();
}
