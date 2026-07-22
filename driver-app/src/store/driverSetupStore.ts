import { create } from 'zustand';
import { storage } from '../lib/storage';

// Resumable driver onboarding draft — persisted so a driver can pause (e.g. to
// gather documents) and come back before submitting for approval.
export interface SetupDraft {
  licenceNo: string;
  vehicleReg: string;
  roadworthyUrl: string; // "uploaded" doc (placeholder URL in this demo)
  idSelfieUrl: string;
}

const EMPTY: SetupDraft = { licenceNo: '', vehicleReg: '', roadworthyUrl: '', idSelfieUrl: '' };
const KEY = 'driverSetupDraft';

interface SetupState extends SetupDraft {
  set: (p: Partial<SetupDraft>) => void;
  clear: () => void;
  hydrate: () => Promise<void>;
}

export const useDriverSetup = create<SetupState>((set, get) => ({
  ...EMPTY,
  set: (p) => {
    set(p);
    const { licenceNo, vehicleReg, roadworthyUrl, idSelfieUrl } = { ...get(), ...p };
    storage.set(KEY, JSON.stringify({ licenceNo, vehicleReg, roadworthyUrl, idSelfieUrl })).catch(() => {});
  },
  clear: () => { set(EMPTY); storage.remove(KEY).catch(() => {}); },
  hydrate: async () => {
    try { const raw = await storage.get(KEY); if (raw) set(JSON.parse(raw)); } catch {}
  },
}));
