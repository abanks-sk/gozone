import { useEffect, useState } from 'react';
import api from '../api/client';

interface SosIncident {
  id: string;
  tripId: string | null;
  userId: string;
  lat: number | null;
  lng: number | null;
  status: 'NEW' | 'HANDLED';
  createdAt: string;
}

export default function Incidents() {
  const [items, setItems] = useState<SosIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load(showSpinner = false) {
    if (showSpinner) setLoading(true);
    try {
      const { data } = await api.get<SosIncident[]>('/rides/sos');
      setItems(data);
    } catch { /* keep last list */ }
    finally { setLoading(false); }
  }

  // SOS alerts must surface without a manual refresh — poll while the page is open.
  useEffect(() => {
    load(true);
    const poll = setInterval(() => load(), 10000);
    return () => clearInterval(poll);
  }, []);

  async function markHandled(id: string) {
    setBusyId(id);
    try {
      await api.patch(`/rides/sos/${id}/handle`);
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Failed to update');
    } finally { setBusyId(null); }
  }

  const fresh = items.filter((i) => i.status === 'NEW');

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 4px' }}>SOS incidents</h1>
      <p className="muted" style={{ marginTop: 0, marginBottom: 20 }}>
        Alerts raised from live trips. Review each one and decide whether to contact the
        passenger, the driver, or the authorities. List refreshes automatically.
      </p>

      {fresh.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: 16 }}>
          <strong style={{ color: 'var(--danger)' }}>
            {fresh.length} unhandled alert{fresh.length > 1 ? 's' : ''} need{fresh.length === 1 ? 's' : ''} attention
          </strong>
        </div>
      )}

      {loading ? (
        <div className="spin" />
      ) : items.length === 0 ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>No SOS alerts. Good news.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {items.map((i) => (
            <div key={i.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <strong style={{ fontSize: 15 }}>
                    {new Date(i.createdAt).toLocaleString()}
                  </strong>
                  <span className="badge" style={{
                    background: i.status === 'NEW' ? 'var(--danger)22' : 'var(--success)22',
                    color: i.status === 'NEW' ? 'var(--danger)' : 'var(--success)',
                  }}>{i.status}</span>
                </div>
                <div className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>
                  User <strong style={{ color: 'var(--text)' }}>{i.userId.slice(0, 8)}…</strong>
                  {i.tripId && <> &nbsp;·&nbsp; Trip <strong style={{ color: 'var(--text)' }}>{i.tripId.slice(0, 8)}…</strong></>}
                  {i.lat != null && i.lng != null && (
                    <> &nbsp;·&nbsp; <a href={`https://maps.google.com/?q=${i.lat},${i.lng}`} target="_blank" rel="noreferrer"
                      style={{ color: 'var(--primary)', fontWeight: 600 }}>View location</a></>
                  )}
                </div>
              </div>
              {i.status === 'NEW' && (
                <button className="btn btn-success" disabled={busyId === i.id} onClick={() => markHandled(i.id)}>
                  Mark handled
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
