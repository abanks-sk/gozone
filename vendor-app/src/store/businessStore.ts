import { create } from 'zustand';
import { storage } from '../lib/storage';

// Editable business profile — local mock (no backend vendor-profile API yet), persisted
// and user-scoped (cleared on logout/login via lib/session.ts).
export interface BusinessData {
  address: string;
  phone: string;
  opensAt: string;   // e.g. "8:00 AM"
  closesAt: string;  // e.g. "10:00 PM"
}

const EMPTY: BusinessData = { address: '', phone: '', opensAt: '', closesAt: '' };
const KEY = 'businessData';

interface BusinessState extends BusinessData {
  setBusiness: (p: Partial<BusinessData>) => void;
  reset: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useBusiness = create<BusinessState>((set, get) => ({
  ...EMPTY,
  setBusiness: (p) => {
    set(p);
    const { address, phone, opensAt, closesAt } = { ...get(), ...p };
    storage.set(KEY, JSON.stringify({ address, phone, opensAt, closesAt })).catch(() => {});
  },
  reset: async () => {
    set({ ...EMPTY });
    await storage.remove(KEY).catch(() => {});
  },
  hydrate: async () => {
    try { const raw = await storage.get(KEY); if (raw) set(JSON.parse(raw)); } catch {}
  },
}));

export function hoursSummary(b: BusinessData): string {
  return b.opensAt && b.closesAt ? `${b.opensAt} – ${b.closesAt}` : 'Not set';
}
