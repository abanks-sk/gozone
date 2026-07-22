import { create } from 'zustand';
import { storage } from '../lib/storage';

// Driver vehicle details — local mock (no backend vehicle API yet), persisted and
// user-scoped (cleared on logout/login via lib/session.ts).
export interface VehicleData {
  make: string;
  model: string;
  plate: string;
  color: string;
}

const EMPTY: VehicleData = { make: '', model: '', plate: '', color: '' };
const KEY = 'vehicleData';

interface VehicleState extends VehicleData {
  setVehicle: (p: Partial<VehicleData>) => void;
  reset: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useVehicle = create<VehicleState>((set, get) => ({
  ...EMPTY,
  setVehicle: (p) => {
    set(p);
    const { make, model, plate, color } = { ...get(), ...p };
    storage.set(KEY, JSON.stringify({ make, model, plate, color })).catch(() => {});
  },
  reset: async () => {
    set({ ...EMPTY });
    await storage.remove(KEY).catch(() => {});
  },
  hydrate: async () => {
    try { const raw = await storage.get(KEY); if (raw) set(JSON.parse(raw)); } catch {}
  },
}));

export function vehicleSummary(v: VehicleData): string {
  const car = [v.make, v.model].filter(Boolean).join(' ');
  return [car, v.plate].filter(Boolean).join(' · ') || 'Not set';
}
