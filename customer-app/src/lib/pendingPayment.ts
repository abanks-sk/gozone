import { storage } from './storage';

/**
 * A Paystack payment that was started but not yet verified.
 *
 * Paystack checkout happens in the device browser, so the app is backgrounded — and coming back
 * frequently reloads the JS context entirely. Anything held in React state at that moment is gone.
 * The reference was held in React state, and the reference is the *only* thing that credits the
 * money: nothing is banked until `/wallet/topup/verify` (or the ride/order pay call) is handed that
 * string. So the customer paid Paystack, came back to a fresh app, and the money simply never
 * arrived — which is exactly the "my top-up didn't reflect" report.
 *
 * Persisting it means the reference outlives the reload and can be redeemed on the way back in.
 * Paystack's verify is idempotent per reference, so re-verifying is safe.
 */
export type PendingKind = 'topup' | 'trip' | 'order';

export interface PendingPayment {
  kind: PendingKind;
  reference: string;
  amount: number;
  /** Trip or order id — absent for a wallet top-up. */
  targetId?: string;
  /** Payment method key, so the pay call can be replayed exactly as it was made. */
  method?: string;
  startedAt: number;
}

const KEY = 'pendingPayment';

/** Not indefinite: a reference the user abandoned days ago should not resurface as a surprise charge. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function setPending(p: Omit<PendingPayment, 'startedAt'>): Promise<void> {
  const record: PendingPayment = { ...p, startedAt: Date.now() };
  await storage.set(KEY, JSON.stringify(record)).catch(() => {});
}

export async function getPending(kind?: PendingKind): Promise<PendingPayment | null> {
  try {
    const raw = await storage.get(KEY);
    if (!raw) return null;
    const p: PendingPayment = JSON.parse(raw);
    if (!p?.reference) return null;
    if (Date.now() - (p.startedAt ?? 0) > MAX_AGE_MS) { await clearPending(); return null; }
    if (kind && p.kind !== kind) return null;
    return p;
  } catch { return null; }
}

export async function clearPending(): Promise<void> {
  await storage.remove(KEY).catch(() => {});
}
