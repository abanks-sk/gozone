import { useEffect, useState } from 'react';
import api from '../api/client';
import AuthImage from '../components/AuthImage';

interface User {
  id: string;
  phone: string;
  email?: string | null;
  name?: string;
  username?: string | null;
  role: string;
  status: string;
  vehicleClass?: string | null;
  serviceMode?: string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleColour?: string | null;
  vehiclePlate?: string | null;
}

interface Kyc {
  id: string;
  status: string;
  licenceNo: string;
  vehicleReg: string;
  idSelfieUrl?: string | null;
  licenceUrl?: string | null;
  vehiclePhotoUrl?: string | null;
  roadworthyUrl?: string | null;
}

interface Business {
  id: string;
  name: string;
  vendorType: string;
  address?: string | null;
  lat: number;
  lng: number;
  approvalStatus: string;
  ownerId: string;
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

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 14.5, fontWeight: 600, marginTop: 3 }}>{value || '—'}</div>
    </div>
  );
}

/**
 * Everything about one applicant, opened in place.
 *
 * The list used to show a name and whether they were a driver or a vendor, which is not enough to
 * approve anybody — the reviewer either took it on trust or went hunting on the KYC page for a
 * record they had no id for. A driver's documents load here, so approving is a decision made while
 * looking at the thing being decided.
 */
function ApplicantDetail({ userId, onZoom }: { userId: string; onZoom: (u: string) => void }) {
  const [detail, setDetail] = useState<{ user: User; kyc?: Kyc | null; createdAt?: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api.get(`/auth/users/${userId}`)
      .then((r) => { if (live) setDetail(r.data); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [userId]);

  if (failed) return <p className="muted" style={{ margin: '14px 0 0' }}>Couldn’t load this applicant.</p>;
  if (!detail) return <div className="spin" style={{ marginTop: 14 }} />;

  const u = detail.user;
  const k = detail.kyc;

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
        <Field label="Name" value={u.name} />
        <Field label="Phone" value={u.phone} />
        <Field label="Email" value={u.email} />
        <Field label="Signed up" value={detail.createdAt ? new Date(detail.createdAt).toLocaleDateString() : null} />
        {(u.role === 'DRIVER' || u.role === 'COURIER') && (
          <>
            {/* Grading a car Standard or Luxe is a judgement about the car, and until this was
                collected at sign-up the reviewer was making it without knowing what the car was. */}
            <Field label="Vehicle" value={[u.vehicleMake, u.vehicleModel].filter(Boolean).join(' ')} />
            <Field label="Colour" value={u.vehicleColour} />
            <Field label="Number plate" value={u.vehiclePlate} />
            <Field label="Vehicle class" value={u.vehicleClass ?? 'Not graded'} />
            <Field label="Accepts" value={u.serviceMode} />
          </>
        )}
      </div>

      {(u.role === 'DRIVER' || u.role === 'COURIER') && (
        <>
          <h3 style={{ fontSize: 15, fontWeight: 800, margin: '20px 0 10px' }}>Documents</h3>
          {!k ? (
            <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
              Nothing submitted yet. Approving now clears the account, but they still cannot drive
              until documents are on file.
            </p>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, marginBottom: 14 }}>
                <Field label="Licence no." value={k.licenceNo} />
                <Field label="Vehicle reg." value={k.vehicleReg} />
                <Field label="Document status" value={k.status} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
                <Doc label="Driver" path={k.idSelfieUrl} onZoom={onZoom} />
                <Doc label="Licence" path={k.licenceUrl} onZoom={onZoom} />
                <Doc label="Vehicle" path={k.vehiclePhotoUrl} onZoom={onZoom} />
                {k.roadworthyUrl ? <Doc label="Roadworthy" path={k.roadworthyUrl} onZoom={onZoom} /> : null}
              </div>
            </>
          )}
        </>
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

export default function Approvals() {
  const [users, setUsers] = useState<User[]>([]);
  // Drivers who are already approved but have no vehicle class. They are invisible to the list
  // above — it filters on PENDING — while their own app reads "Awaiting admin", so without this
  // second list a car driver waits on a queue nobody can see.
  const [awaitingClass, setAwaitingClass] = useState<User[]>([]);
  // Businesses awaiting review. A separate decision from the account: approving a person is a check
  // on who they are, approving a shop is a check on the shop — and an already-approved owner can
  // open a second one, which nobody was reviewing at all.
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [owners, setOwners] = useState<Record<string, User>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [pending, unclassed, pendingBiz] = await Promise.allSettled([
      api.get<User[]>('/auth/users?status=PENDING'),
      api.get<User[]>('/auth/users/awaiting-class'),
      api.get<Business[]>('/food/admin/vendors?approval=PENDING'),
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
    const biz = pendingBiz.status === 'fulfilled' ? pendingBiz.value.data : [];
    setBusinesses(biz);
    setLoading(false);

    // Who owns each business. A shop name on its own does not tell you whose it is, and the owner's
    // own approval state is exactly the context needed to judge the shop.
    const ids = [...new Set(biz.map((b) => b.ownerId))];
    const found: Record<string, User> = {};
    await Promise.all(ids.map(async (id) => {
      try { found[id] = (await api.get(`/auth/users/${id}`)).data.user; } catch { /* owner unreadable */ }
    }));
    setOwners(found);
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

  async function reviewBusiness(id: string, status: 'APPROVED' | 'REJECTED') {
    let note: string | null = null;
    if (status === 'REJECTED') {
      note = askReason('business');
      if (note === null) return;
    }
    setBusyId(id);
    try {
      await api.patch(`/food/admin/vendors/${id}/approval`, { status, note });
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
      <p className="muted" style={{ marginTop: 0, marginBottom: 20 }}>
        Accounts and businesses awaiting verification. Approving a driver approves their documents
        with them.
      </p>

      {loading ? (
        <div className="spin" />
      ) : (
        <>
          <h2 style={{ fontSize: 19, fontWeight: 800, margin: '0 0 2px' }}>Accounts</h2>
          <p className="muted" style={{ marginTop: 0, marginBottom: 14, fontSize: 13.5 }}>
            A check on the person. Click one to see their details and documents before deciding.
          </p>
          {users.length === 0 ? (
            <div className="card"><p className="muted" style={{ margin: 0 }}>No accounts awaiting approval. 🎉</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {users.map((u) => (
                <div key={u.id} className="card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                    <Identity user={u} />
                    {(u.role === 'DRIVER' || u.role === 'COURIER') && <ClassPicker user={u} onPick={assignClass} />}
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button className="btn" onClick={() => setOpenId(openId === u.id ? null : u.id)}>
                        {openId === u.id ? 'Hide' : 'Details'}
                      </button>
                      <button className="btn btn-success" disabled={busyId === u.id} onClick={() => review(u.id, 'ACTIVE')}>Approve</button>
                      <button className="btn btn-danger" disabled={busyId === u.id} onClick={() => review(u.id, 'REJECTED')}>Reject</button>
                    </div>
                  </div>
                  {openId === u.id && <ApplicantDetail userId={u.id} onZoom={setZoom} />}
                </div>
              ))}
            </div>
          )}

          <h2 style={{ fontSize: 19, fontWeight: 800, margin: '30px 0 2px' }}>Businesses</h2>
          <p className="muted" style={{ marginTop: 0, marginBottom: 14, fontSize: 13.5 }}>
            A check on the shop, separate from its owner’s account — including the second and third
            one an approved vendor opens. Customers cannot see a business until it is approved.
          </p>
          {businesses.length === 0 ? (
            <div className="card"><p className="muted" style={{ margin: 0 }}>No businesses awaiting approval.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {businesses.map((b) => {
                const owner = owners[b.ownerId];
                return (
                  <div key={b.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--primary)' }}>
                      {(b.name?.[0] ?? '?').toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <strong style={{ fontSize: 15 }}>{b.name}</strong>
                        <span className="badge" style={{ background: 'var(--surface-alt)', color: 'var(--text-muted)' }}>{b.vendorType}</span>
                      </div>
                      <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
                        {b.address || `${Number(b.lat).toFixed(4)}, ${Number(b.lng).toFixed(4)}`}
                      </div>
                      <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>
                        Owner: {owner ? `${owner.name ?? 'Unnamed'} · ${owner.phone}` : '—'}
                        {owner && owner.status !== 'ACTIVE' ? ` · account ${owner.status.toLowerCase()}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button className="btn btn-success" disabled={busyId === b.id} onClick={() => reviewBusiness(b.id, 'APPROVED')}>Approve</button>
                      <button className="btn btn-danger" disabled={busyId === b.id} onClick={() => reviewBusiness(b.id, 'REJECTED')}>Reject</button>
                    </div>
                  </div>
                );
              })}
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

      {zoom && (
        <div onClick={() => setZoom(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, zIndex: 50, cursor: 'zoom-out' }}>
          <img src={zoom} alt="Document" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} />
        </div>
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
