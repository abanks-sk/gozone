import { create } from 'zustand';
import { storage } from '../lib/storage';
import { Place } from '../data/places';

// Saved places are a local mock (no backend profile API yet), persisted across
// restarts and user-scoped — cleared on logout/login via lib/session.ts. Home and
// Work are dedicated shortcuts; `custom` holds any other saved spots the user adds.
export interface SavedPlace {
  id: string;
  place: Place;
}

interface SavedPlacesState {
  home: Place | null;
  work: Place | null;
  custom: SavedPlace[];
  setHome: (p: Place) => void;
  setWork: (p: Place) => void;
  removeHome: () => void;
  removeWork: () => void;
  addCustom: (p: Place) => void;
  renameCustom: (id: string, label: string) => void;
  removeCustom: (id: string) => void;
  reset: () => Promise<void>;
  hydrate: () => Promise<void>;
}

const KEY = 'savedPlaces';

export const useSavedPlaces = create<SavedPlacesState>((set, get) => ({
  home: null,
  work: null,
  custom: [],

  setHome: (p) => { set({ home: p }); persist(get); },
  setWork: (p) => { set({ work: p }); persist(get); },
  removeHome: () => { set({ home: null }); persist(get); },
  removeWork: () => { set({ work: null }); persist(get); },

  addCustom: (p) => {
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    set({ custom: [{ id, place: p }, ...get().custom] });
    persist(get);
  },
  renameCustom: (id, label) => {
    set({ custom: get().custom.map((s) => (s.id === id ? { ...s, place: { ...s.place, label } } : s)) });
    persist(get);
  },
  removeCustom: (id) => {
    set({ custom: get().custom.filter((s) => s.id !== id) });
    persist(get);
  },

  reset: async () => {
    set({ home: null, work: null, custom: [] });
    await storage.remove(KEY).catch(() => {});
  },
  hydrate: async () => {
    try {
      const raw = await storage.get(KEY);
      if (raw) {
        const data = JSON.parse(raw);
        set({ home: data.home ?? null, work: data.work ?? null, custom: data.custom ?? [] });
      }
    } catch {}
  },
}));

function persist(get: () => SavedPlacesState) {
  const { home, work, custom } = get();
  storage.set(KEY, JSON.stringify({ home, work, custom })).catch(() => {});
}
