import { create } from 'zustand';
import { storage } from '../lib/storage';
import type { WithdrawalMethod } from '../api/wallet';

// Where this earner's cash outs go. Remembered locally (persisted, user-scoped — cleared
// on logout/login via lib/session.ts) purely so nobody retypes their momo number every
// payday; the destination is sent with each request and the backend owns the payout record.
export interface PayoutDestination {
  method: WithdrawalMethod;
  /** Mobile-money network (MTN / VODAFONE / AIRTELTIGO) or the bank name. */
  provider: string;
  accountNumber: string;
  accountName: string;
}

const DEFAULTS: PayoutDestination = {
  method: 'MOMO',
  provider: 'MTN',
  accountNumber: '',
  accountName: '',
};

const KEY = 'payoutDestination';

interface PayoutState extends PayoutDestination {
  save: (d: Partial<PayoutDestination>) => void;
  reset: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const usePayout = create<PayoutState>((set, get) => ({
  ...DEFAULTS,
  save: (d) => {
    set(d);
    const { method, provider, accountNumber, accountName } = { ...get(), ...d };
    storage.set(KEY, JSON.stringify({ method, provider, accountNumber, accountName })).catch(() => {});
  },
  reset: async () => {
    set({ ...DEFAULTS });
    await storage.remove(KEY).catch(() => {});
  },
  hydrate: async () => {
    try { const raw = await storage.get(KEY); if (raw) set(JSON.parse(raw)); } catch {}
  },
}));

/** Mobile-money networks GoZone pays out to. */
export const MOMO_NETWORKS: { code: string; label: string }[] = [
  { code: 'MTN', label: 'MTN MoMo' },
  { code: 'VODAFONE', label: 'Telecel Cash' },
  { code: 'AIRTELTIGO', label: 'AirtelTigo' },
];
