import { useEffect, useState } from 'react';
import api from '../api/client';
import AuthImage from '../components/AuthImage';

interface EditRequest {
  id: string;
  userId: string;
  driverName?: string | null;
  driverPhone?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  current: Record<string, string | null>;
  proposed: Record<string, string | null>;
  reason?: string | null;
  reviewNote?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
}

const LABEL: Record<string, string> = {
  name: 'Name',
  vehicleMake: 'Make',
  vehicleModel: 'Model',
  vehicleColour: 'Colour',
  vehiclePlate: 'Number plate',
  licenceNo: 'Licence number',
  idSelfieUrl: 'Driver photo',
  licenceUrl: 'Licence photo',
  vehiclePhotoUrl: 'Vehicle photo',
  roadworthyUrl: 'Roadworthy',
};
const isDoc = (k: string) => k.endsWith('Url');

const FILTERS = ['PENDING', 'APPROVED', 'REJECTED'] as const;
const TONE: Record<string, string> = {
  PENDING: 'var(--warning)', APPROVED: 'var(--success)', REJECTED: 'var(--danger)',
};

/**
 * Changes drivers have asked for to details that were already verified.
 *
 * A driver's name, vehicle and documents are locked once their account is approved — they are what
 * an admin checked. This is where a change gets looked at: the current value and the proposed one
 * side by side, because that comparison *is* the decision. Nothing on the account moves until
 * Approve is pressed.
 */
export default function EditRequests() {
  const [rows, setRows] = useState<EditRequest[]>([]);
  const [filter, setFilter] = useState<typeof FILTERS[number]>('PENDING');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get<EditRequest[]>(`/auth/edit-requests?status=${filter}`);
      setRows(data);
    } catch { setRows([]); }
    setLoading(false);
  }
  useEffect(() => { load(); }, [filter]);

  async function review(id: string, status: 'APPROVED' | 'REJECTED') {
    let note: string | null = null;
    if (status === 'REJECTED') {
      note = window.prompt('Why is this change being refused?\n\nThe driver sees this, so say what they need to do.');
      if (note === null) return;
      if (!note.trim()) { alert('A reason is required to reject.'); return; }
    }
    setBusyId(id);
    try {
      await api.patch(`/auth/edit-requests/${id}`, { status, note });
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Failed to update');
    } finally { setBusyId(null); }
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 4px' }}>Change requests</h1>
      <p className="muted" style={{ marginTop: 0, marginBottom: 20 }}>
        Drivers asking to change a name, vehicle or document that was already verified. Nothing takes
        effect until you approve it.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {FILTERS.map((f) => (
          <button key={f} className="btn" onClick={() => setFilter(f)}
            style={{ background: filter === f ? 'var(--primary)' : 'var(--surface-alt)', color: filter === f ? '#fff' : 'var(--text)' }}>
            {f[0] + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="spin" />
      ) : rows.length === 0 ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>Nothing here.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {rows.map((r) => (
            <div key={r.id} className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <strong style={{ fontSize: 15 }}>{r.driverName ?? 'Unnamed'}</strong>
                    <span className="badge" style={{ background: 'var(--surface-alt)', color: TONE[r.status] }}>{r.status}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
                    {r.driverPhone} · asked {new Date(r.createdAt).toLocaleString()}
                  </div>
                </div>
                {r.status === 'PENDING' && (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-success" disabled={busyId === r.id} onClick={() => review(r.id, 'APPROVED')}>Approve</button>
                    <button className="btn btn-danger" disabled={busyId === r.id} onClick={() => review(r.id, 'REJECTED')}>Reject</button>
                  </div>
                )}
              </div>

              {r.reason && (
                <p style={{ margin: '12px 0 0', fontSize: 14 }}>
                  <span className="muted" style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Their reason</span>
                  <br />{r.reason}
                </p>
              )}

              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16 }}>
                {Object.keys(r.proposed).map((k) => (
                  <div key={k}>
                    <div className="muted" style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                      {LABEL[k] ?? k}
                    </div>
                    {isDoc(k) ? (
                      <div style={{ display: 'flex', gap: 10 }}>
                        <div>
                          <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>on file</div>
                          <AuthImage path={r.current[k]} alt="current" height={110} onClick={setZoom} />
                        </div>
                        <div>
                          <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>proposed</div>
                          <AuthImage path={r.proposed[k]} alt="proposed" height={110} onClick={setZoom} />
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 14.5, fontWeight: 600 }}>
                        <span className="muted" style={{ textDecoration: 'line-through' }}>{r.current[k] || '—'}</span>
                        {'  →  '}
                        <span>{r.proposed[k]}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {r.reviewNote && (
                <p className="muted" style={{ margin: '12px 0 0', fontSize: 13.5 }}>
                  Refused: {r.reviewNote}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {zoom && (
        <div onClick={() => setZoom(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, zIndex: 50, cursor: 'zoom-out' }}>
          <img src={zoom} alt="Document" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}
