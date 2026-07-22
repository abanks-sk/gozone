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
  getBalance: (ownerType = 'RIDER') =>
    api.get<{ balance: number; ownerType: string }>(`/wallet/balance?ownerType=${ownerType}`)
      .then(r => r.data),

  getLedger: (ownerType = 'RIDER') =>
    api.get<LedgerEntry[]>(`/wallet/ledger?ownerType=${ownerType}`).then(r => r.data),

  registerPushToken: (token: string) =>
    api.post('/wallet/push-token', { token }),

  getNotifications: () =>
    api.get<Notification[]>('/wallet/notifications').then(r => r.data),
};
