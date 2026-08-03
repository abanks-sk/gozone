import { useEffect, useState } from 'react';
import api from '../api/client';

interface User {
  id: string;
  phone: string;
  name?: string;
  role: string;
  status: string;
  vehicleClass?: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  DRIVER: 'Driver', COURIER: 'Courier', RESTAURANT_OWNER: 'Vendor', RIDER: 'Passenger',
};
const CLASSES = ['OKADA', 'STANDARD', 'LUXE', 'CARGO'];

// Declared at module scope, not inside Approvals: a component defined in a render body is a new
// component type every render, so React remounts it — which would close this <select> mid-choice.
function ClassPicker({ user, onPick }: { user: User; onPick: (id: string, cl: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label className="muted" style={{ fontSize: 11.5 }}>Vehicle class</label>
      <select value={user.vehicleClass ?? ''} onChange={(e) => onPick(user.id, e.target.value)}
        style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--surface-alt)', color: 'var(--text)', border: '1px solid var(--border)' }}>
        <option value="">— set class —</option>
        {CLASSES.map((cl) => <option key={cl} value={cl}>{cl}</option>)}
      </select>
    </div>
  );
}

function Identity({ user, note }: { user: User; note?: string }) {
  return (
    <>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--primary)' }}>
        {(user.name?.[0] ?? '?').toUpperCase()}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <strong style={{ fontSize: 15 }}>{user.name ?? 'Unnamed'}</strong>
          <span className="badge" style={{ background: 'var(--surface-alt)', color: 'var(--text-muted)' }}>{ROLE_LABEL[user.role] ?? user.role}</span>
        </div>
        <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>{user.phone}{note ? ` · ${note}` : ''}</div>
      </div>
    </>
  );
}

export default function Approvals() {
  const [users, setUsers] = useState<User[]>([]);
  // Drivers who are already approved but have no vehicle class. They are invisible to the list
  // above — it filters on PENDING — while their own app reads "Awaiting admin", so without this
  // second list a car driver waits on a queue nobody can see.
  const [awaitingClass, setAwaitingClass] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [pending, unclassed] = await Promise.allSettled([
      api.get<User[]>('/auth/users?status=PENDING'),
      api.get<User[]>('/auth/users/awaiting-class'),
    ]);
    setUsers(pending.status === 'fulfilled' ? pending.value.data : []);
    // Anyone still pending is shown above with their own class picker; listing them twice would
    // just be two controls for one decision.
    const pendingIds = new Set(
      pending.status === 'fulfilled' ? pending.value.data.map((u) => u.id) : [],
    );
    setAwaitingClass(
      unclassed.status === 'fulfilled'
        ? unclassed.value.data.filter((u) => !pendingIds.has(u.id))
        : [],
    );
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function review(id: string, status: 'ACTIVE' | 'REJECTED') {
    let note: string | null = null;
    if (status === 'REJECTED') {
      note = askReason('account');
      if (note === null) return;
    }
    setBusyId(id);
    try {
      await api.patch(`/auth/users/${id}/status`, { status, note });
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Failed to update');
    } finally { setBusyId(null); }
  }

  async function assignClass(id: string, vehicleClass: string) {
    if (!vehicleClass) return;
    try {
      await api.patch(`/auth/users/${id}/class`, { vehicleClass });
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, vehicleClass } : u)));
      // A graded driver is no longer waiting, so they leave this list rather than sitting there
      // looking like outstanding work.
      setAwaitingClass((prev) => prev.filter((u) => u.id !== id));
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Failed to set class');
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 4px' }}>Approvals</h1>
      <p className="muted" style={{ marginTop: 0, marginBottom: 20 }}>Drivers & vendors awaiting verification</p>

      {loading ? (
        <div className="spin" />
      ) : (
        <>
          {users.length === 0 ? (
            <div className="card"><p className="muted" style={{ margin: 0 }}>No accounts awaiting approval. 🎉</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {users.map((u) => (
                <div key={u.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <Identity user={u} />
                  {(u.role === 'DRIVER' || u.role === 'COURIER') && <ClassPicker user={u} onPick={assignClass} />}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-success" disabled={busyId === u.id} onClick={() => review(u.id, 'ACTIVE')}>Approve</button>
                    <button className="btn btn-danger" disabled={busyId === u.id} onClick={() => review(u.id, 'REJECTED')}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {awaitingClass.length > 0 && (
            <>
              <h2 style={{ fontSize: 19, fontWeight: 800, margin: '30px 0 2px' }}>Awaiting vehicle class</h2>
              <p className="muted" style={{ marginTop: 0, marginBottom: 14, fontSize: 13.5 }}>
                Approved drivers who registered a car. Their app reads “Awaiting admin” until you
                grade it — a Standard or Luxe car sees different work, so this has to be a judgement
                someone makes after seeing the vehicle.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {awaitingClass.map((u) => (
                  <div key={u.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                    <Identity user={u} note={u.status === 'ACTIVE' ? 'Approved' : u.status} />
                    <ClassPicker user={u} onPick={assignClass} />
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Ask why, when the answer is no.
 *
 * The applicant is shown this, so it has to say what to change — the server refuses a rejection
 * without one. Approvals need no explanation and are not asked for one.
 */
function askReason(what: string): string | null {
  const note = window.prompt(`Why is this ${what} being rejected?

The applicant sees this, so say what they need to change.`);
  if (note === null) return null;           // cancelled
  if (!note.trim()) { alert('A reason is required to reject.'); return null; }
  return note.trim();
}
