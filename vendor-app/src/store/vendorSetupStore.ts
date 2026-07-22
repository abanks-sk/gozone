import { create } from 'zustand';
import { storage } from '../lib/storage';

// Resumable vendor onboarding draft — persisted so an owner can pause and resume
// before submitting their business for approval.
export interface VendorSetupDraft {
  name: string;
  vendorType: string;       // RESTAURANT | PHARMACY | GROCERY | CONVENIENCE | OTHER
  locationLabel: string;    // human label; coords default to Accra in this demo
}

const EMPTY: VendorSetupDraft = { name: '', vendorType: 'RESTAURANT', locationLabel: '' };
const KEY = 'vendorSetupDraft';

interface SetupState extends VendorSetupDraft {
  set: (p: Partial<VendorSetupDraft>) => void;
  clear: () => void;
  hydrate: () => Promise<void>;
}

export const useVendorSetup = create<SetupState>((set, get) => ({
  ...EMPTY,
  set: (p) => {
    set(p);
    const { name, vendorType, locationLabel } = { ...get(), ...p };
    storage.set(KEY, JSON.stringify({ name, vendorType, locationLabel })).catch(() => {});
  },
  clear: () => { set(EMPTY); storage.remove(KEY).catch(() => {}); },
  hydrate: async () => {
    try { const raw = await storage.get(KEY); if (raw) set(JSON.parse(raw)); } catch {}
  },
}));
