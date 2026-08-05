import { useEffect, useState } from 'react';
import api from '../api/client';

interface SosIncident {
  id: string;
  tripId: string | null;
  userId: string;
  /** Where the reporter is, refreshed by their app while the alert is open. */
  lat: number | null;
  lng: number | null;
  /** How current that position is — a stale pin must not be presented as a live one. */
  locationAt: string | null;
  status: 'NEW' | 'HANDLED';
  createdAt: string;
  reporterName: string | null;
  reporterPhone: string | null;
  driverId: string | null;
  driverName: string | null;
  driverPhone: string | null;
  vehicle: string | null;
  plate: string | null;
  /** The vehicle's own last ping. On a trip that has gone wrong this diverges from the reporter's. */
  driverLat: number | null;
  driverLng: number | null;
  tripStatus: string | null;
}

/** "just now" / "4 min ago" — an SOS pin is only as useful as its age. */
function ago(iso: string | null): string | null {
  if (!iso) return null;
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 45) return 'just now';
  if (secs < 3600) return `${Math.round(secs / 60)} min ago`;
  return `${Math.round(secs / 3600)} h ago`;
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
                {/* These alerts are settled by ringing people, so the names and numbers are the
                    point — a truncated UUID is not something a safety team can act on. */}
                <div className="muted" style={{ fontSize: 13.5, marginTop: 6, lineHeight: 1.7 }}>
                  <div>
                    Passenger{' '}
                    <strong style={{ color: 'var(--text)' }}>
                      {i.reporterName || `${i.userId.slice(0, 8)}…`}
                    </strong>
                    {i.reporterPhone && <> &nbsp;·&nbsp; <a href={`tel:${i.reporterPhone}`} style={{ color: 'var(--primary)', fontWeight: 600 }}>{i.reporterPhone}</a></>}
                  </div>
                  {(i.driverName || i.driverId) && (
                    <div>
                      Driver{' '}
                      <strong style={{ color: 'var(--text)' }}>
                        {i.driverName || `${i.driverId!.slice(0, 8)}…`}
                      </strong>
                      {i.driverPhone && <> &nbsp;·&nbsp; <a href={`tel:${i.driverPhone}`} style={{ color: 'var(--primary)', fontWeight: 600 }}>{i.driverPhone}</a></>}
                      {(i.vehicle || i.plate) && <> &nbsp;·&nbsp; {[i.vehicle, i.plate].filter(Boolean).join(' · ')}</>}
                    </div>
                  )}
                  <div>
                    {i.tripStatus && <>Trip <strong style={{ color: 'var(--text)' }}>{i.tripStatus}</strong></>}
                    {i.lat != null && i.lng != null && (
                      <> &nbsp;·&nbsp; <a href={`https://maps.google.com/?q=${i.lat},${i.lng}`} target="_blank" rel="noreferrer"
                        style={{ color: 'var(--primary)', fontWeight: 600 }}>Passenger location</a>
                        {ago(i.locationAt) && <span style={{ opacity: 0.75 }}> ({ago(i.locationAt)})</span>}</>
                    )}
                    {i.driverLat != null && i.driverLng != null && (
                      <> &nbsp;·&nbsp; <a href={`https://maps.google.com/?q=${i.driverLat},${i.driverLng}`} target="_blank" rel="noreferrer"
                        style={{ color: 'var(--primary)', fontWeight: 600 }}>Vehicle location</a></>
                    )}
                  </div>
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
