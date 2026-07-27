import { create } from 'zustand';
import { storage } from '../lib/storage';
import { walletApi } from '../api/wallet';

// The chosen method is persisted locally so it survives app restarts.
export interface PayMethodMeta {
  key: string;
  label: string;
  sub: string;
  icon: string; // Ionicons name
}

// The methods everyone has. Mobile money is here rather than something you "add": Paystack
// does not issue reusable authorizations for momo, so it always goes through their checkout and
// there is nothing a saved number could ever be used for. Collecting one was theatre — the
// customer typed it into our form and then typed it again on Paystack's page.
//
// Cards are different: a successful card payment hands back an authorization we CAN charge
// again, so cards appear in the list on their own after the first payment. See `cards` below.
export const PAY_METHODS: PayMethodMeta[] = [
  { key: 'wallet', label: 'GoZone Wallet', sub: 'Pay from your balance', icon: 'wallet' },
  { key: 'cash', label: 'Cash', sub: 'Pay the driver directly', icon: 'cash-outline' },
  { key: 'momo', label: 'Mobile Money', sub: 'MTN, Telecel or AirtelTigo', icon: 'phone-portrait-outline' },
];

/** Wallet and cash settle in-app; momo and cards go through Paystack. */
export const isPaystack = (key: string) => key !== 'wallet' && key !== 'cash';

/** A saved card pays server-side in one tap; everything else Paystack needs the checkout page. */
export const isSavedCard = (key: string) => key.startsWith('card_');
export const cardIdOf = (key: string) => key.replace(/^card_/, '');

const STORAGE_KEY = 'paymentMethod';
const CARDS_KEY = 'paymentCards';

interface PaymentState {
  selected: string;
  cards: PayMethodMeta[]; // saved cards, loaded from the server (never stored on the device)
  loadCards: () => Promise<void>;
  setSelected: (key: string) => void;
  removeCard: (key: string) => Promise<void>;
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
  /** Cards live on the server — the device holds no card data at all, only the chosen method. */
  loadCards: async () => {
    try {
      const saved = await walletApi.listCards();
      set({
        cards: saved.map((cd) => ({
          key: `card_${cd.id}`,
          label: cd.brand || 'Card',
          sub: cd.last4 ? `•••• ${cd.last4}` : 'Saved card',
          icon: 'card-outline',
        })),
      });
      // A card removed on another device must not stay selected here.
      const { selected, cards } = get();
      if (selected.startsWith('card_') && !cards.some((c) => c.key === selected)) {
        set({ selected: 'wallet' });
        storage.set(STORAGE_KEY, 'wallet').catch(() => {});
      }
    } catch { /* offline — keep whatever we last showed */ }
  },
  removeCard: async (key) => {
    try { await walletApi.removeCard(cardIdOf(key)); } catch { return; }
    const cards = get().cards.filter((c) => c.key !== key);
    const selected = get().selected === key ? 'wallet' : get().selected;
    set({ cards, selected });
    storage.set(STORAGE_KEY, selected).catch(() => {});
  },
  reset: async () => {
    set({ selected: 'wallet', cards: [] });
    await Promise.all([storage.remove(STORAGE_KEY), storage.remove(CARDS_KEY)]).catch(() => {});
  },
  hydrate: async () => {
    try {
      const v = await storage.get(STORAGE_KEY);
      if (v) set({ selected: v });
      // Clear out card data written by the old local-mock version — it held real card numbers
      // entered into a form that never sent them anywhere, which is the worst of both worlds.
      await storage.remove(CARDS_KEY).catch(() => {});
    } catch {}
    // Cards come from the server; failure is silent so a cold start never blocks on the network.
    get().loadCards();
  },
}));
