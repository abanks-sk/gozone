import { create } from 'zustand';
import { storage } from '../lib/storage';

// A local cache of the server profile (GET/PATCH /auth/me), persisted so the greeting,
// avatar and phone render instantly on launch and survive being offline. auth-service is
// the source of truth: every write goes through the API first, then lands here.
export interface ProfileData {
  name: string;
  username: string;
  email: string;
  phone: string;
}

// Empty by default — a fresh install / new account starts blank and is filled from
// sign-up input or the backend profile (/auth/me). No shared placeholder identity.
const DEFAULTS: ProfileData = {
  name: '',
  username: '',
  email: '',
  phone: '',
};

const STORAGE_KEY = 'profileData';

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
    const { name, username, email, phone } = get();
    storage.set(STORAGE_KEY, JSON.stringify({ name, username, email, phone, ...p })).catch(() => {});
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
    await storage.remove(STORAGE_KEY).catch(() => {});
  },
  hydrate: async () => {
    try {
      const raw = await storage.get(STORAGE_KEY);
      if (raw) set(JSON.parse(raw));
    } catch {}
  },
}));

/** First initial for avatars. */
export function initial(name: string): string {
  return (name.trim()[0] ?? 'G').toUpperCase();
}
