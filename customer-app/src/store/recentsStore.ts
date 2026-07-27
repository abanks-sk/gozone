import { create } from 'zustand';
import { storage } from '../lib/storage';
import { Place } from '../data/places';

// Real recent destinations — starts EMPTY for a new account and fills as the user
// picks places. Persisted across restarts. (Replaces the old hardcoded RECENTS.)
interface RecentsState {
  recents: Place[];
  add: (p: Place) => void;
  /** Rename the entry at these coordinates — see the note on `relabel` below. */
  relabel: (lat: number, lng: number, p: Place) => void;
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
  /**
   * Replace the entry sitting at these coordinates.
   *
   * "Use current location" has to record the place before it knows its name — the whole point of
   * that change was to stop making the user wait on a reverse-geocode. It writes a placeholder
   * ("Current location") and upgrades it a second later. Without this the recent stayed frozen on
   * the placeholder forever, so the list filled up with entries all called "Current location"
   * pointing at different places — useless as a shortcut, which is the only reason recents exist.
   *
   * Matched on coordinates rather than label, because the label is precisely what changed.
   */
  relabel: (lat, lng, p) => {
    const at = (r: Place) => r.lat === lat && r.lng === lng;
    if (!get().recents.some(at)) return;
    const next = get().recents
      .map((r) => (at(r) ? p : r))
      // The new name may already be in the list (you've been here before) — collapse the pair
      // rather than showing the same place twice.
      .filter((r, i, all) => i === all.findIndex((o) => o.label === r.label && o.sub === r.sub));
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
