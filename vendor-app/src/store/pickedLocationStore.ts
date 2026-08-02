import { create } from 'zustand';

/**
 * A one-shot handoff from the map picker back to whichever screen opened it.
 *
 * expo-router cannot return a value from a pushed route, and stuffing coordinates through query
 * params round-trips them via strings and survives in the URL long after they are meaningful.
 * A tiny store keeps the pick where it belongs — in memory, until it is consumed.
 *
 * Deliberately **not persisted**: a location you chose in a previous session is not a location
 * you are choosing now, and reviving it would silently move a business.
 */
export interface PickedLocation {
  lat: number;
  lng: number;
  label: string;
}

interface State {
  picked: PickedLocation | null;
  set: (p: PickedLocation) => void;
  /** Read once and clear, so a stale pick can never be applied twice. */
  consume: () => PickedLocation | null;
}

export const usePickedLocation = create<State>((set, get) => ({
  picked: null,
  set: (p) => set({ picked: p }),
  consume: () => {
    const p = get().picked;
    if (p) set({ picked: null });
    return p;
  },
}));
