import { create } from 'zustand';
import { Place, OSU } from '../data/places';

export interface CartOption { group: string; label: string; price: number; optionId?: string }

export interface CartLine {
  key: string;            // unique per item+options combo
  menuItemId: string;     // real backend id, for placing the order
  name: string;
  basePrice: number;
  options: CartOption[];
  qty: number;
}

interface FoodCartState {
  restaurantId: string | null;
  restaurantName: string | null;
  deliveryPlace: Place;
  lines: CartLine[];

  setDeliveryPlace: (p: Place) => void;
  add: (restaurantId: string, restaurantName: string, line: Omit<CartLine, 'key'>) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
}

function lineKey(menuItemId: string, options: CartOption[]) {
  return menuItemId + '|' + options.map((o) => o.group + ':' + o.label).sort().join(',');
}

export const useShopCart = create<FoodCartState>((set, get) => ({
  restaurantId: null,
  restaurantName: null,
  deliveryPlace: OSU,
  lines: [],

  setDeliveryPlace: (p) => set({ deliveryPlace: p }),

  add: (restaurantId, restaurantName, line) => {
    const state = get();
    // A cart belongs to one restaurant — switching restaurants resets it.
    const sameRestaurant = state.restaurantId === restaurantId;
    const baseLines = sameRestaurant ? state.lines : [];
    const key = lineKey(line.menuItemId, line.options);
    const existing = baseLines.find((l) => l.key === key);
    const lines = existing
      ? baseLines.map((l) => (l.key === key ? { ...l, qty: l.qty + line.qty } : l))
      : [...baseLines, { ...line, key }];
    set({ restaurantId, restaurantName, lines });
  },

  setQty: (key, qty) => set((s) => ({
    lines: qty <= 0 ? s.lines.filter((l) => l.key !== key) : s.lines.map((l) => (l.key === key ? { ...l, qty } : l)),
  })),

  remove: (key) => set((s) => ({ lines: s.lines.filter((l) => l.key !== key) })),

  clear: () => set({ lines: [], restaurantId: null, restaurantName: null }),
}));

export function lineTotal(l: CartLine): number {
  const add = l.options.reduce((sum, o) => sum + o.price, 0);
  return (l.basePrice + add) * l.qty;
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((n, l) => n + l.qty, 0);
}

export function cartTotal(lines: CartLine[]): number {
  return lines.reduce((t, l) => t + lineTotal(l), 0);
}
