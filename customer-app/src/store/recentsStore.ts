import { create } from 'zustand';
import { storage } from '../lib/storage';
import { Place } from '../data/places';

/**
 * Places this account has searched for, newest first.
 *
 * Stored **per user id**. It used to live under one shared key and be deleted by
 * `clearUserData()`, which runs on every fresh sign-in — so signing back into your own account
 * threw away your own history, and the list only ever held what you had searched since the last
 * login. Keying by owner means the next person to use the phone sees their own empty list without
 * anyone's history being destroyed to achieve it.
 */
interface RecentsState {
  recents: Place[];
  add: (p: Place) => void;
  /** Rename the entry at these coordinates — see the note on `relabel` below. */
  relabel: (lat: number, lng: number, p: Place) => void;
  /** Stop showing this account's list. Does NOT delete it — see the note on the store. */
  reset: () => Promise<void>;
  hydrate: (userId?: string | null) => Promise<void>;
}

const LEGACY_KEY = 'recentPlaces';
const keyFor = (id: string | null) => `recentPlaces:${id ?? 'anon'}`;

/**
 * Write this account's list, but only once we know whose it is.
 *
 * <p>With no owner the key falls back to `anon`, a bucket nothing reads after sign-in — so a
 * search made before hydration finished was saved somewhere it could never be found again, which
 * looks exactly like "my recents were cleared when I logged back in". Holding it in memory and
 * skipping the write is the honest outcome: nothing is lost that was ever really stored.
 */
function persist(list: Place[]) {
  if (!ownerId) return;
  storage.set(keyFor(ownerId), JSON.stringify(list)).catch(() => {});
}

/**
 * Whose list is loaded. Held in the module rather than read from the auth store, because
 * `authStore → lib/session → recentsStore` already exists and importing back would close the loop.
 */
let ownerId: string | null = null;

/**
 * Enough to be a real history rather than a peek at the last few. The home screen shows the top
 * handful; the search screen shows everything, which is where you go looking for somewhere you
 * went a month ago. Still bounded — an unbounded list is a slow leak.
 */
const MAX = 100;

export const useRecents = create<RecentsState>((set, get) => ({
  recents: [],
  add: (p) => {
    // Don't record the Home/Work shortcuts as "recent".
    if (p.label === 'Home' || p.label === 'Work') return;
    const deduped = get().recents.filter((r) => !(r.label === p.label && r.sub === p.sub));
    const next = [p, ...deduped].slice(0, MAX);
    set({ recents: next });
    persist(next);
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
    persist(next);
  },
  reset: async () => {
    // Clears the screen, not the record. This runs on logout and before every sign-in, so deleting
    // here is exactly what used to cost a returning user their whole history.
    ownerId = null;
    set({ recents: [] });
  },
  hydrate: async (userId = null) => {
    ownerId = userId ?? null;
    try {
      let raw = await storage.get(keyFor(ownerId));
      // Adopt the pre-per-account list the first time a signed-in user loads, so nobody's existing
      // history disappears at the version where this changed.
      if (!raw && ownerId) {
        const legacy = await storage.get(LEGACY_KEY);
        if (legacy) {
          raw = legacy;
          await storage.set(keyFor(ownerId), legacy).catch(() => {});
          await storage.remove(LEGACY_KEY).catch(() => {});
        }
      }
      set({ recents: raw ? JSON.parse(raw) : [] });
    } catch {
      set({ recents: [] });
    }
  },
}));
