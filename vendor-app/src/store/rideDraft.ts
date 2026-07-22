import { create } from 'zustand';
import { Place, KOTOKA, OSU } from '../data/places';

// Shared ride draft so the search screen and the home screen agree on
// the current origin / destination.
interface RideDraftState {
  origin: Place;
  dest: Place;
  setOrigin: (p: Place) => void;
  setDest: (p: Place) => void;
  swap: () => void;
}

export const useRideDraft = create<RideDraftState>((set) => ({
  origin: KOTOKA,
  dest: OSU,
  setOrigin: (p) => set({ origin: p }),
  setDest: (p) => set({ dest: p }),
  swap: () => set((s) => ({ origin: s.dest, dest: s.origin })),
}));
