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

export default function Approvals() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get<User[]>('/auth/users?status=PENDING');
      setUsers(data);
    } catch { setUsers([]); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function review(id: string, status: 'ACTIVE' | 'REJECTED') {
    setBusyId(id);
    try {
      await api.patch(`/auth/users/${id}/status`, { status });
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
      ) : users.length === 0 ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>No accounts awaiting approval. 🎉</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {users.map((u) => (
            <div key={u.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--primary)' }}>
                {(u.name?.[0] ?? '?').toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <strong style={{ fontSize: 15 }}>{u.name ?? 'Unnamed'}</strong>
                  <span className="badge" style={{ background: 'var(--surface-alt)', color: 'var(--text-muted)' }}>{ROLE_LABEL[u.role] ?? u.role}</span>
                </div>
                <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>{u.phone}</div>
              </div>
              {(u.role === 'DRIVER' || u.role === 'COURIER') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label className="muted" style={{ fontSize: 11.5 }}>Vehicle class</label>
                  <select value={u.vehicleClass ?? ''} onChange={(e) => assignClass(u.id, e.target.value)}
                    style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--surface-alt)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                    <option value="">— set class —</option>
                    {CLASSES.map((cl) => <option key={cl} value={cl}>{cl}</option>)}
                  </select>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-success" disabled={busyId === u.id} onClick={() => review(u.id, 'ACTIVE')}>Approve</button>
                <button className="btn btn-danger" disabled={busyId === u.id} onClick={() => review(u.id, 'REJECTED')}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
