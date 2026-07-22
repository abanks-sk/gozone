import { create } from 'zustand';
import { storage } from '../lib/storage';

// The chosen method is persisted locally so it survives app restarts.
export interface PayMethodMeta {
  key: string;
  label: string;
  sub: string;
  icon: string; // Ionicons name
}

// Everyone gets these two by default. Mobile-money / card methods are added by the
// user and are routed through Paystack (see isPaystack).
export const PAY_METHODS: PayMethodMeta[] = [
  { key: 'wallet', label: 'GoZone Wallet', sub: 'Pay from your balance', icon: 'wallet' },
  { key: 'cash', label: 'Cash', sub: 'Pay the driver directly', icon: 'cash-outline' },
];

/** Wallet and cash settle in-app; everything else (added momo/cards) goes through Paystack. */
export const isPaystack = (key: string) => key !== 'wallet' && key !== 'cash';

const STORAGE_KEY = 'paymentMethod';
const CARDS_KEY = 'paymentCards';

interface PaymentState {
  selected: string;
  cards: PayMethodMeta[]; // user-added cards (local mock; no real PSP)
  setSelected: (key: string) => void;
  addCard: (card: PayMethodMeta) => void;
  removeCard: (key: string) => void;
  reset: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const usePaymentStore = create<PaymentState>((set, get) => ({
  selected: 'wallet',
  cards: [],
  setSelected: (key) => {
    set({ selected: key });
    storage.set(STORAGE_KEY, key).catch(() => {});
  },
  addCard: (card) => {
    const cards = [...get().cards, card];
    set({ cards, selected: card.key });
    storage.set(CARDS_KEY, JSON.stringify(cards)).catch(() => {});
    storage.set(STORAGE_KEY, card.key).catch(() => {});
  },
  removeCard: (key) => {
    const cards = get().cards.filter((c) => c.key !== key);
    const selected = get().selected === key ? 'wallet' : get().selected;
    set({ cards, selected });
    storage.set(CARDS_KEY, JSON.stringify(cards)).catch(() => {});
    storage.set(STORAGE_KEY, selected).catch(() => {});
  },
  reset: async () => {
    set({ selected: 'wallet', cards: [] });
    await Promise.all([storage.remove(STORAGE_KEY), storage.remove(CARDS_KEY)]).catch(() => {});
  },
  hydrate: async () => {
    try {
      const [v, rawCards] = await Promise.all([storage.get(STORAGE_KEY), storage.get(CARDS_KEY)]);
      if (rawCards) set({ cards: JSON.parse(rawCards) });
      if (v) set({ selected: v });
    } catch {}
  },
}));
