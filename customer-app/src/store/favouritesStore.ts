import { create } from 'zustand';
import { storage } from '../lib/storage';

// Favourite vendors — a local mock (no backend), persisted and user-scoped (cleared
// on logout/login via lib/session.ts). Stored as an id list so it's JSON-serialisable;
// shared by the shop browse hearts and the menu-page heart.
interface FavouritesState {
  ids: string[];
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  reset: () => Promise<void>;
  hydrate: () => Promise<void>;
}

const KEY = 'favouriteVendors';

export const useFavourites = create<FavouritesState>((set, get) => ({
  ids: [],
  has: (id) => get().ids.includes(id),
  toggle: (id) => {
    const ids = get().ids.includes(id) ? get().ids.filter((x) => x !== id) : [id, ...get().ids];
    set({ ids });
    storage.set(KEY, JSON.stringify(ids)).catch(() => {});
  },
  reset: async () => {
    set({ ids: [] });
    await storage.remove(KEY).catch(() => {});
  },
  hydrate: async () => {
    try { const raw = await storage.get(KEY); if (raw) set({ ids: JSON.parse(raw) }); } catch {}
  },
}));
