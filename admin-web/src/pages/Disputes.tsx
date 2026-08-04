import { useEffect, useState } from 'react';
import api from '../api/client';

interface PickupDispute {
  tripId: string;
  tripStatus: string;
  riderId: string;
  riderPhone: string | null;
  driverId: string;
  driverName: string | null;
  driverPhone: string | null;
  vehicle: string | null;
  plate: string | null;
  lockedFare: number;
  pickupSeq: number;
  paymentStatus: 'UNPAID' | 'AWAITING' | 'PAID';
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  pickedUpAt: string | null;
  disputedAt: string;
  note: string | null;
  resolvedAt: string | null;
  outcome: string | null;
}

/**
 * Pickup disputes — a passenger says they are not in the car a driver marked them into.
 *
 * <p>This is the backstop, not the first line: most of these are a mis-tap the driver fixes in
 * their own app the moment they are told, and the row disappears from here on its own. What lands
 * on this page is the remainder — the ones where the two people disagree, or the driver has not
 * looked. That is why both phone numbers are on the card. There is no way to settle this from a
 * screen; you settle it by ringing them, and then you record what you found.
 */
export default function Disputes() {
  const [items, setItems] = useState<PickupDispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [openOnly, setOpenOnly] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const keyOf = (d: PickupDispute) => `${d.tripId}:${d.riderId}`;

  async function load(showSpinner = false) {
    if (showSpinner) setLoading(true);
    try {
      const { data } = await api.get<PickupDispute[]>(`/rides/pickup-disputes?openOnly=${openOnly}`);
      setItems(data);
    } catch { /* keep the last list rather than blanking the page on one bad poll */ }
    finally { setLoading(false); }
  }

  // A live dispute is somebody sitting in a car being charged for a ride they say they are not on,
  // and most resolve themselves when the driver acts — so the list has to move without a refresh,
  // both to show new ones and to clear the ones that no longer need anybody.
  useEffect(() => {
    load(true);
    const poll = setInterval(() => load(), 10000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openOnly]);

  async function resolve(d: PickupDispute, uphold: boolean) {
    let note: string | null = null;
    if (uphold) {
      note = window.prompt(
        'Upholding this removes the passenger from the ride and they will not be charged.\n\n' +
        'Anything to tell them? (optional)') ?? null;
    } else {
      // Refusing leaves a fare on somebody who has said it is not theirs, so it cannot be done
      // silently — the server rejects a blank reason and the passenger is shown whatever is typed.
      note = window.prompt(
        'Refusing means the passenger stays on this ride and owes the fare.\n\n' +
        'Why? The passenger reads this.');
      if (note === null) return;          // they backed out
      if (!note.trim()) { alert('A reason is required to refuse a dispute.'); return; }
    }
    setBusyId(keyOf(d));
    try {
      await api.patch(`/rides/pickup-disputes/${d.tripId}/${d.riderId}`, {
        decision: uphold ? 'UPHELD' : 'REJECTED',
        note,
      });
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Failed to resolve');
    } finally { setBusyId(null); }
  }

  const open = items.filter((d) => !d.resolvedAt);

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 4px' }}>Pickup disputes</h1>
      <p className="muted" style={{ marginTop: 0, marginBottom: 20, maxWidth: 720, lineHeight: 1.55 }}>
        A passenger says they are not in the car their driver marked them into. Being marked as
        picked up closes their option to leave and puts the fare on them, so an unresolved one is
        somebody being charged for a ride they say they never took. Most are a mis-tap the driver
        corrects themselves and they clear from this list on their own — what stays is a
        disagreement. Ring both parties, then record what you found. Refreshes automatically.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[{ k: true, label: 'Open' }, { k: false, label: 'All' }].map((f) => (
          <button key={String(f.k)} className="btn" onClick={() => setOpenOnly(f.k)}
            style={{
              background: openOnly === f.k ? 'var(--primary)' : 'var(--surface-alt)',
              color: openOnly === f.k ? '#fff' : 'var(--text-muted)',
            }}>{f.label}</button>
        ))}
      </div>

      {openOnly && open.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--warning)', marginBottom: 16 }}>
          <strong style={{ color: 'var(--warning)' }}>
            {open.length} unresolved dispute{open.length > 1 ? 's' : ''} — each one is a fare on
            somebody who says it is not theirs
          </strong>
        </div>
      )}

      {loading ? (
        <div className="spin" />
      ) : items.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            {openOnly
              ? 'No open disputes. Drivers are either getting it right or fixing it themselves.'
              : 'No pickup disputes have ever been raised.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {items.map((d) => {
            const settled = !!d.resolvedAt;
            const upheld = (d.outcome ?? '').startsWith('UPHELD');
            return (
              <div key={keyOf(d)} className="card"
                style={{ borderColor: settled ? 'var(--border)' : 'var(--warning)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 15 }}>
                        Passenger {d.pickupSeq} · GH₵ {d.lockedFare}
                      </strong>
                      <span className="badge" style={{
                        background: settled ? (upheld ? 'var(--success)22' : 'var(--danger)22') : 'var(--warning)22',
                        color: settled ? (upheld ? 'var(--success)' : 'var(--danger)') : 'var(--warning)',
                      }}>{settled ? (upheld ? 'UPHELD' : 'REFUSED') : 'OPEN'}</span>
                      <span className="badge" style={{ background: 'var(--surface-alt)', color: 'var(--text-muted)' }}>
                        trip {d.tripStatus}
                      </span>
                      {d.paymentStatus === 'PAID' && (
                        <span className="badge" style={{ background: 'var(--surface-alt)', color: 'var(--text-muted)' }}>
                          already paid
                        </span>
                      )}
                    </div>

                    {/* What they actually said. The reason anyone is looking at this card. */}
                    {d.note && (
                      <p style={{ margin: '10px 0 0', fontSize: 14.5, lineHeight: 1.5 }}>
                        “{d.note}”
                      </p>
                    )}

                    <div className="muted" style={{ fontSize: 13.5, marginTop: 10, lineHeight: 1.7 }}>
                      Raised {new Date(d.disputedAt).toLocaleString()}
                      {d.pickedUpAt && <> &nbsp;·&nbsp; marked aboard {new Date(d.pickedUpAt).toLocaleTimeString()}</>}
                      <br />
                      {/* Both numbers, because this is settled on the phone and not on this page. */}
                      Passenger{' '}
                      {d.riderPhone
                        ? <a href={`tel:${d.riderPhone}`} style={{ color: 'var(--primary)', fontWeight: 600 }}>{d.riderPhone}</a>
                        : <strong style={{ color: 'var(--text)' }}>{d.riderId.slice(0, 8)}…</strong>}
                      &nbsp;·&nbsp; Driver{' '}
                      <strong style={{ color: 'var(--text)' }}>{d.driverName ?? `${d.driverId.slice(0, 8)}…`}</strong>
                      {d.driverPhone && <> (<a href={`tel:${d.driverPhone}`} style={{ color: 'var(--primary)', fontWeight: 600 }}>{d.driverPhone}</a>)</>}
                      {(d.vehicle || d.plate) && <> &nbsp;·&nbsp; {[d.vehicle, d.plate].filter(Boolean).join(' · ')}</>}
                      <br />
                      Pickup{' '}
                      <a href={`https://maps.google.com/?q=${d.originLat},${d.originLng}`} target="_blank" rel="noreferrer"
                        style={{ color: 'var(--primary)', fontWeight: 600 }}>map</a>
                      &nbsp;·&nbsp; Trip <strong style={{ color: 'var(--text)' }}>{d.tripId.slice(0, 8)}…</strong>
                    </div>

                    {settled && d.outcome && (
                      <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: 'var(--surface-alt)', fontSize: 13.5 }}>
                        {d.outcome}
                        <span className="muted"> · {new Date(d.resolvedAt!).toLocaleString()}</span>
                      </div>
                    )}
                  </div>

                  {!settled && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 150 }}>
                      <button className="btn btn-success" disabled={busyId === keyOf(d)}
                        onClick={() => resolve(d, true)}>Uphold — remove</button>
                      <button className="btn btn-danger" disabled={busyId === keyOf(d)}
                        onClick={() => resolve(d, false)}>Refuse — they stay</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
