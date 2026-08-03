import { create } from 'zustand';
import { storage } from '../lib/storage';

// Resumable driver onboarding draft — persisted so a driver can pause (e.g. to
// gather documents) and come back before submitting for approval.
export interface SetupDraft {
  licenceNo: string;
  vehicleReg: string;
  /** Optional roadworthy certificate. */
  roadworthyUrl: string;
  /** The three required photos, as `/auth/uploads/{id}` paths returned by the server.
   *  These were placeholder strings set on tap until KYC was unmocked — nothing was captured. */
  idSelfieUrl: string;
  licenceUrl: string;
  vehiclePhotoUrl: string;
}

const EMPTY: SetupDraft = {
  licenceNo: '', vehicleReg: '', roadworthyUrl: '',
  idSelfieUrl: '', licenceUrl: '', vehiclePhotoUrl: '',
};
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
    const { licenceNo, vehicleReg, roadworthyUrl, idSelfieUrl, licenceUrl, vehiclePhotoUrl } = { ...get(), ...p };
    storage.set(KEY, JSON.stringify({
      licenceNo, vehicleReg, roadworthyUrl, idSelfieUrl, licenceUrl, vehiclePhotoUrl,
    })).catch(() => {});
  },
  clear: () => { set(EMPTY); storage.remove(KEY).catch(() => {}); },
  hydrate: async () => {
    try { const raw = await storage.get(KEY); if (raw) set(JSON.parse(raw)); } catch {}
  },
}));
