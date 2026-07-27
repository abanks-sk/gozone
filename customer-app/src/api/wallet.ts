export interface SavedCard {
  id: string;
  brand: string;
  last4: string | null;
  bank: string | null;
  expMonth: string | null;
  expYear: string | null;
}

import api from './client';

export interface LedgerEntry {
  id: string;
  amount: number;
  type: string;
  refType?: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  channel: string;
  sent: boolean;
  createdAt: string;
}

export const walletApi = {
  /** Cards Paystack has authorised us to charge again — no card number ever leaves the server. */
  listCards: () => api.get<SavedCard[]>('/wallet/cards').then(r => r.data),

  removeCard: (id: string) => api.delete(`/wallet/cards/${id}`),

  /** One-tap charge. Returns a reference the normal verify paths then confirm. */
  chargeCard: (id: string, amount: number) =>
    api.post<{ reference: string }>(`/wallet/cards/${id}/charge`, { amount }).then(r => r.data),

  /** Ask the server to remember the card behind a payment that just succeeded. Best-effort. */
  rememberCard: (reference: string, amount: number) =>
    api.post('/wallet/cards/remember', { reference, amount }).catch(() => {}),

  getBalance: (ownerType = 'RIDER') =>
    api.get<{ balance: number; ownerType: string }>(`/wallet/balance?ownerType=${ownerType}`)
      .then(r => r.data),

  getLedger: (ownerType = 'RIDER') =>
    api.get<LedgerEntry[]>(`/wallet/ledger?ownerType=${ownerType}`).then(r => r.data),

  // Wallet funding (Paystack). initialize → open authorizationUrl → verify credits the wallet.
  initializeTopUp: (amount: number, email?: string) =>
    api.post<{ reference: string; authorizationUrl: string }>('/wallet/topup/initialize', { amount, email })
      .then(r => r.data),

  verifyTopUp: (amount: number, reference: string) =>
    api.post<{ balance: number; status: string }>('/wallet/topup/verify', { amount, reference })
      .then(r => r.data),

  // Start a Paystack payment for a ride/order (card & mobile money). Returns a checkout URL.
  payInitialize: (amount: number, email?: string) =>
    api.post<{ reference: string; authorizationUrl: string }>('/wallet/pay/initialize', { amount, email })
      .then(r => r.data),

  registerPushToken: (token: string) =>
    api.post('/wallet/push-token', { token }),

  getNotifications: () =>
    api.get<Notification[]>('/wallet/notifications').then(r => r.data),
};
