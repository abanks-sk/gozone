import { useEffect, useState } from 'react';
import api from '../api/client';

interface Kyc { id: string; status: string; }
interface Vendor { id: string; vendorType?: string; }

export default function Dashboard({ onReviewKyc, onApprovals }: { onReviewKyc: () => void; onApprovals: () => void }) {
  const [pendingApprovals, setPendingApprovals] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [verified, setVerified] = useState<number | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [appr, p, v, vend] = await Promise.allSettled([
        api.get<Kyc[]>('/auth/users?status=PENDING'),
        api.get<Kyc[]>('/auth/driver/kyc?status=PENDING'),
        api.get<Kyc[]>('/auth/driver/kyc?status=VERIFIED'),
        api.get<Vendor[]>('/food/restaurants'),
      ]);
      if (appr.status === 'fulfilled') setPendingApprovals(appr.value.data.length);
      if (p.status === 'fulfilled') setPending(p.value.data.length);
      if (v.status === 'fulfilled') setVerified(v.value.data.length);
      if (vend.status === 'fulfilled') setVendors(vend.value.data);
      setLoading(false);
    })();
  }, []);

  const byType = vendors.reduce<Record<string, number>>((acc, v) => {
    const t = v.vendorType ?? 'RESTAURANT';
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 4px' }}>Dashboard</h1>
      <p className="muted" style={{ marginTop: 0, marginBottom: 24 }}>Platform overview</p>

      {loading ? (
        <div className="spin" />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16, marginBottom: 24 }}>
            <Stat label="Awaiting approval" value={pendingApprovals ?? '—'} accent="var(--warning)" />
            <Stat label="Pending KYC" value={pending ?? '—'} accent="var(--warning)" />
            <Stat label="Verified drivers" value={verified ?? '—'} accent="var(--success)" />
            <Stat label="Vendors" value={vendors.length} accent="var(--primary)" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
            <div className="card">
              <h3 style={{ marginTop: 0, fontSize: 16 }}>Vendors by type</h3>
              {Object.keys(byType).length === 0 ? (
                <p className="muted" style={{ fontSize: 14 }}>No vendors found.</p>
              ) : (
                Object.entries(byType).map(([t, n]) => (
                  <div key={t} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ textTransform: 'capitalize' }}>{t.toLowerCase()}</span>
                    <strong>{n}</strong>
                  </div>
                ))
              )}
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0, fontSize: 16 }}>Actions & incidents</h3>
              {(pendingApprovals ?? 0) > 0 && (
                <button className="btn" style={{ width: '100%', marginBottom: 10 }} onClick={onApprovals}>
                  Review {pendingApprovals} pending approval{pendingApprovals === 1 ? '' : 's'} →
                </button>
              )}
              {(pending ?? 0) > 0 ? (
                <button className="btn btn-ghost" style={{ width: '100%', marginBottom: 12 }} onClick={onReviewKyc}>
                  Review {pending} pending KYC →
                </button>
              ) : (
                <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>No KYC awaiting review.</p>
              )}
              <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 0 }}>
                SOS / trip incidents are logged server-side (stub). Check ride-service logs for
                <code> [SOS-STUB] </code> entries.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent: string }) {
  return (
    <div className="card">
      <div style={{ fontSize: 32, fontWeight: 800, color: accent }}>{value}</div>
      <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{label}</div>
    </div>
  );
}
