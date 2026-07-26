import { useEffect, useState } from 'react';
import api from '../api/client';

interface Withdrawal {
  id: string;
  ownerId: string;
  ownerType: string;
  amount: number;
  method: 'MOMO' | 'BANK';
  accountName: string;
  accountNumberMasked: string;
  provider: string;
  status: 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED';
  note: string | null;
  createdAt: string;
  completedAt: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'var(--warning)',
  PROCESSING: 'var(--primary)',
  PAID: 'var(--success)',
  FAILED: 'var(--danger)',
};

export default function Payouts() {
  const [items, setItems] = useState<Withdrawal[]>([]);
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load(showSpinner = false) {
    if (showSpinner) setLoading(true);
    try {
      const { data } = await api.get<Withdrawal[]>(`/wallet/withdrawals/all?open=${open}`);
      setItems(data);
    } catch { /* keep last list */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(true); }, [open]);

  async function review(w: Withdrawal, status: 'PAID' | 'FAILED') {
    // Marking paid is an assertion that the money actually left — worth a beat of thought.
    const confirmed = status === 'PAID'
      ? window.confirm(
          `Confirm you have sent GH¢ ${w.amount.toFixed(2)} to ${w.accountName} `
          + `(${w.provider} ${w.accountNumberMasked}).\n\nThis closes the payout.`)
      : true;
    if (!confirmed) return;

    let reason: string | null = null;
    if (status === 'FAILED') {
      reason = window.prompt(
        'Why did the payout fail? The earner sees this, and the money goes back to their wallet.',
        'Payout could not be completed');
      if (reason === null) return;
    }

    setBusyId(w.id);
    try {
      await api.patch(`/wallet/withdrawals/${w.id}`, { status, reason });
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Failed to update');
    } finally { setBusyId(null); }
  }

  const owed = items
    .filter((w) => w.status === 'PENDING' || w.status === 'PROCESSING')
    .reduce((sum, w) => sum + w.amount, 0);

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 4px' }}>Payouts</h1>
      <p className="muted" style={{ marginTop: 0, marginBottom: 20 }}>
        Cash outs requested by drivers, couriers and vendors. The amount has already left
        their GoZone balance and is held — send it, then mark it paid. Marking a payout
        failed returns the money to their wallet and tells them why.
      </p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <button className={open ? 'btn' : 'btn btn-ghost'} onClick={() => setOpen(true)}>To pay</button>
        <button className={!open ? 'btn' : 'btn btn-ghost'} onClick={() => setOpen(false)}>Recent</button>
      </div>

      {open && owed > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <strong>GH¢ {owed.toFixed(2)}</strong>{' '}
          <span className="muted">owed across {items.length} payout{items.length > 1 ? 's' : ''}</span>
        </div>
      )}

      {loading ? (
        <div className="spin" />
      ) : items.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            {open ? 'Nothing waiting to be paid out.' : 'No payouts yet.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {items.map((w) => (
            <div key={w.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <strong style={{ fontSize: 17 }}>GH¢ {w.amount.toFixed(2)}</strong>
                  <span className="badge" style={{
                    background: `${STATUS_COLOR[w.status]}22`, color: STATUS_COLOR[w.status],
                  }}>{w.status}</span>
                  <span className="badge">{w.ownerType === 'RESTAURANT' ? 'Vendor' : 'Driver'}</span>
                </div>
                <div className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>
                  <strong style={{ color: 'var(--text)' }}>{w.accountName}</strong>
                  &nbsp;·&nbsp; {w.method === 'MOMO' ? 'Mobile money' : 'Bank'} · {w.provider} {w.accountNumberMasked}
                  &nbsp;·&nbsp; requested {new Date(w.createdAt).toLocaleString()}
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                  User {w.ownerId.slice(0, 8)}…
                  {w.completedAt && <> &nbsp;·&nbsp; closed {new Date(w.completedAt).toLocaleString()}</>}
                </div>
                {w.note && (
                  <div style={{
                    fontSize: 12.5, marginTop: 8,
                    color: w.status === 'FAILED' ? 'var(--danger)' : 'var(--muted)',
                  }}>{w.note}</div>
                )}
              </div>
              {(w.status === 'PENDING' || w.status === 'PROCESSING') && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-success" disabled={busyId === w.id} onClick={() => review(w, 'PAID')}>
                    Mark paid
                  </button>
                  <button className="btn btn-danger" disabled={busyId === w.id} onClick={() => review(w, 'FAILED')}>
                    Mark failed
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
