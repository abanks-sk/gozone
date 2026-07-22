import { create } from 'zustand';
import { storage } from '../lib/storage';
import { Trip, RideRequest } from '../api/ride';

// Driver session state: online toggle (persisted) + the current active trip,
// set when the driver accepts a request so the Trip screen can pick it up
// without the driver pasting an id. `activeReq` keeps the accepted request so
// the Trip screen can show the route + rate the rider afterwards.
/** An offer sent to a passenger, awaiting their decision. */
export interface PendingOffer {
  bidId: string;
  req: RideRequest;
  amount: number;
  type: 'ACCEPT' | 'COUNTER';
}

interface DriverState {
  online: boolean;
  activeTrip: Trip | null;
  activeReq: RideRequest | null;
  /** Offer sent, waiting for the passenger to pick a driver. */
  pendingOffer: PendingOffer | null;
  /** Driver's position when they offered — start point for the en-route GPS demo. */
  myPos: { lat: number; lng: number } | null;
  acceptedToday: number;
  setOnline: (v: boolean) => void;
  setActiveTrip: (t: Trip | null) => void;
  setActiveReq: (r: RideRequest | null) => void;
  setPendingOffer: (o: PendingOffer | null) => void;
  setMyPos: (p: { lat: number; lng: number } | null) => void;
  bumpAccepted: () => void;
  reset: () => Promise<void>;
  hydrate: () => Promise<void>;
}

const ONLINE_KEY = 'driverOnline';

export const useDriverStore = create<DriverState>((set, get) => ({
  online: false,
  activeTrip: null,
  activeReq: null,
  pendingOffer: null,
  myPos: null,
  acceptedToday: 0,
  setOnline: (v) => {
    set({ online: v });
    storage.set(ONLINE_KEY, v ? '1' : '0').catch(() => {});
  },
  setActiveTrip: (t) => set({ activeTrip: t }),
  setActiveReq: (r) => set({ activeReq: r }),
  setPendingOffer: (o) => set({ pendingOffer: o }),
  setMyPos: (p) => set({ myPos: p }),
  bumpAccepted: () => set({ acceptedToday: get().acceptedToday + 1 }),
  reset: async () => {
    set({ online: false, activeTrip: null, activeReq: null, pendingOffer: null, myPos: null, acceptedToday: 0 });
    await storage.remove(ONLINE_KEY).catch(() => {});
  },
  hydrate: async () => {
    try {
      const v = await storage.get(ONLINE_KEY);
      if (v != null) set({ online: v === '1' });
    } catch {}
  },
}));
