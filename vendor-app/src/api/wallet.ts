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

export type WithdrawalMethod = 'MOMO' | 'BANK';
export type WithdrawalStatus = 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED';

export interface Withdrawal {
  id: string;
  ownerType: string;
  amount: number;
  method: WithdrawalMethod;
  accountName: string;
  accountNumberMasked: string;
  provider: string;
  status: WithdrawalStatus;
  /** Why it's still queued, or why it failed. */
  note?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

export interface WithdrawalInput {
  amount: number;
  method: WithdrawalMethod;
  accountName: string;
  accountNumber: string;
  provider: string;
  ownerType?: string;
}

export const walletApi = {
  getBalance: (ownerType = 'RIDER') =>
    api.get<{ balance: number; ownerType: string }>(`/wallet/balance?ownerType=${ownerType}`)
      .then(r => r.data),

  getLedger: (ownerType = 'RIDER') =>
    api.get<LedgerEntry[]>(`/wallet/ledger?ownerType=${ownerType}`).then(r => r.data),

  /** Cash out earned money. The wallet is debited straight away (the money is held). */
  requestWithdrawal: (input: WithdrawalInput) =>
    api.post<Withdrawal>('/wallet/withdrawals', input).then(r => r.data),

  getWithdrawals: (ownerType = 'DRIVER') =>
    api.get<Withdrawal[]>(`/wallet/withdrawals?ownerType=${ownerType}`).then(r => r.data),

  registerPushToken: (token: string) =>
    api.post('/wallet/push-token', { token }),

  getNotifications: () =>
    api.get<Notification[]>('/wallet/notifications').then(r => r.data),
};
