import { create } from 'zustand';
import { storage } from '../lib/storage';
import { Place } from '../data/places';

// Real recent destinations — starts EMPTY for a new account and fills as the user
// picks places. Persisted across restarts. (Replaces the old hardcoded RECENTS.)
interface RecentsState {
  recents: Place[];
  add: (p: Place) => void;
  reset: () => Promise<void>;
  hydrate: () => Promise<void>;
}

const KEY = 'recentPlaces';
const MAX = 6;

export const useRecents = create<RecentsState>((set, get) => ({
  recents: [],
  add: (p) => {
    // Don't record the Home/Work shortcuts as "recent".
    if (p.label === 'Home' || p.label === 'Work') return;
    const deduped = get().recents.filter((r) => !(r.label === p.label && r.sub === p.sub));
    const next = [p, ...deduped].slice(0, MAX);
    set({ recents: next });
    storage.set(KEY, JSON.stringify(next)).catch(() => {});
  },
  reset: async () => {
    set({ recents: [] });
    await storage.remove(KEY).catch(() => {});
  },
  hydrate: async () => {
    try { const raw = await storage.get(KEY); if (raw) set({ recents: JSON.parse(raw) }); } catch {}
  },
}));
