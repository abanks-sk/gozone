import { create } from 'zustand';
import { storage } from '../lib/storage';
import { Restaurant } from '../api/food';

// Which business this vendor is currently managing. The demo seed has several
// vendors under one owner (restaurant / pharmacy / grocery), so the app lets the
// owner switch between them. Selection + open state persist across restarts.
interface VendorState {
  vendor: Restaurant | null;
  open: boolean; // accepting orders
  setVendor: (v: Restaurant) => void;
  setOpen: (v: boolean) => void;
  reset: () => Promise<void>;
  hydrate: () => Promise<void>;
}

const VENDOR_KEY = 'vendorSelected';
const OPEN_KEY = 'vendorOpen';

export const useVendorStore = create<VendorState>((set) => ({
  vendor: null,
  open: true,
  setVendor: (v) => {
    set({ vendor: v });
    storage.set(VENDOR_KEY, JSON.stringify(v)).catch(() => {});
  },
  setOpen: (v) => {
    set({ open: v });
    storage.set(OPEN_KEY, v ? '1' : '0').catch(() => {});
  },
  reset: async () => {
    set({ vendor: null, open: true });
    await Promise.all([storage.remove(VENDOR_KEY), storage.remove(OPEN_KEY)]).catch(() => {});
  },
  hydrate: async () => {
    try {
      const [raw, openRaw] = await Promise.all([storage.get(VENDOR_KEY), storage.get(OPEN_KEY)]);
      if (raw) set({ vendor: JSON.parse(raw) });
      if (openRaw != null) set({ open: openRaw === '1' });
    } catch {}
  },
}));
