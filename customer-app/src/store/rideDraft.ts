import { create } from 'zustand';
import { Place, KOTOKA } from '../data/places';

/**
 * "No destination yet".
 *
 * The draft used to be seeded with Osu, so every new account was quietly proposed a destination
 * it had never asked for — and a fare quote to go with it. A pickup can be guessed from GPS
 * because there is a right answer; where someone wants to GO cannot be.
 *
 * A sentinel rather than `null` because ride and parcel screens throughout the app read
 * `dest.lat`/`dest.label` directly; making the type nullable would be correct but would ripple
 * through every one of them. `hasDest` is the check to use before quoting a fare or drawing a route.
 */
export const NO_DEST: Place = { label: '', sub: '', lat: 0, lng: 0 };
export const hasDest = (p: Place | null | undefined): boolean =>
  !!p && !!p.label && (p.lat !== 0 || p.lng !== 0);

// Shared ride draft so the search screen and the home screen agree on
// the current origin / destination.
interface RideDraftState {
  origin: Place;
  dest: Place;
  scheduledAt: number | null; // epoch ms; null = ride now
  setOrigin: (p: Place) => void;
  setDest: (p: Place) => void;
  setScheduledAt: (t: number | null) => void;
  swap: () => void;
}

export const useRideDraft = create<RideDraftState>((set) => ({
  origin: KOTOKA,
  dest: NO_DEST,
  scheduledAt: null,
  setOrigin: (p) => set({ origin: p }),
  setDest: (p) => set({ dest: p }),
  setScheduledAt: (scheduledAt) => set({ scheduledAt }),
  // Nothing to swap with an empty destination — leave the draft alone rather than
  // blanking the pickup the rider has already got right.
  swap: () => set((s) => (hasDest(s.dest) ? { origin: s.dest, dest: s.origin } : {})),
}));
