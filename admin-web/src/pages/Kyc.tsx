import { useEffect, useState } from 'react';
import api from '../api/client';
import AuthImage from '../components/AuthImage';

interface KycItem {
  id: string;
  userId: string;
  status: string;
  licenceNo: string;
  vehicleReg: string;
  driverName?: string | null;
  driverPhone?: string | null;
  idSelfieUrl?: string | null;
  licenceUrl?: string | null;
  vehiclePhotoUrl?: string | null;
  roadworthyUrl?: string | null;
}

const FILTERS = ['PENDING', 'VERIFIED', 'REJECTED'] as const;
type Filter = (typeof FILTERS)[number];

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'var(--warning)', VERIFIED: 'var(--success)', REJECTED: 'var(--danger)',
};

export default function Kyc() {
  const [filter, setFilter] = useState<Filter>('PENDING');
  const [items, setItems] = useState<KycItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Click a document to see it full size. A licence at thumbnail size is not reviewable, and
  // approving an identity you cannot actually read is the thing this page exists to prevent.
  const [zoom, setZoom] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get<KycItem[]>(`/auth/driver/kyc?status=${filter}`);
      setItems(data);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [filter]);

  async function review(id: string, status: 'VERIFIED' | 'REJECTED') {
    setBusyId(id);
    try {
      await api.patch(`/auth/driver/kyc/${id}`, { status });
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Failed to update');
    } finally { setBusyId(null); }
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 4px' }}>Driver KYC</h1>
      <p className="muted" style={{ marginTop: 0, marginBottom: 20 }}>
        Review driver verification submissions. Check the licence is readable and that the face
        matches it before approving.
      </p>

      {/* Filter tabs */}
      <div style={{ display: 'inline-flex', background: 'var(--surface-alt)', borderRadius: 999, padding: 4, marginBottom: 20 }}>
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              border: 'none', borderRadius: 999, padding: '8px 18px', fontSize: 13, fontWeight: 700,
              background: filter === f ? 'var(--surface)' : 'transparent',
              color: filter === f ? 'var(--text)' : 'var(--text-muted)',
            }}>{f[0] + f.slice(1).toLowerCase()}</button>
        ))}
      </div>

      {loading ? (
        <div className="spin" />
      ) : items.length === 0 ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>No {filter.toLowerCase()} submissions.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {items.map((k) => (
            <div key={k.id} className="card">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Name and phone, not a truncated UUID — you cannot verify an identity
                        against an id fragment. */}
                    <strong style={{ fontSize: 15 }}>{k.driverName || `Driver ${k.userId.slice(0, 8)}…`}</strong>
                    <span className="badge" style={{ background: `${STATUS_COLOR[k.status]}22`, color: STATUS_COLOR[k.status] }}>{k.status}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>
                    {k.driverPhone ? <>{k.driverPhone} &nbsp;·&nbsp; </> : null}
                    Licence <strong style={{ color: 'var(--text)' }}>{k.licenceNo || '—'}</strong>
                    &nbsp;·&nbsp; Vehicle <strong style={{ color: 'var(--text)' }}>{k.vehicleReg || '—'}</strong>
                  </div>
                </div>
                {k.status === 'PENDING' && (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-success" disabled={busyId === k.id} onClick={() => review(k.id, 'VERIFIED')}>Approve</button>
                    <button className="btn btn-danger" disabled={busyId === k.id} onClick={() => review(k.id, 'REJECTED')}>Reject</button>
                  </div>
                )}
              </div>

              {/* The documents themselves — this page used to show none of them. */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 16 }}>
                <Doc label="Driver" path={k.idSelfieUrl} onZoom={setZoom} />
                <Doc label="Licence" path={k.licenceUrl} onZoom={setZoom} />
                <Doc label="Vehicle" path={k.vehiclePhotoUrl} onZoom={setZoom} />
                <Doc label="Roadworthy (optional)" path={k.roadworthyUrl} onZoom={setZoom} />
              </div>
            </div>
          ))}
        </div>
      )}

      {zoom && (
        <div onClick={() => setZoom(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, cursor: 'zoom-out',
          }}>
          <img src={zoom} alt="Document" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}

function Doc({ label, path, onZoom }: { label: string; path?: string | null; onZoom: (u: string) => void }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
        {label}
      </div>
      <AuthImage path={path} alt={label} onClick={onZoom} />
    </div>
  );
}
