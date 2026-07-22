import { useEffect, useState } from 'react';
import api from '../api/client';

interface Promo {
  id: string;
  title: string;
  subtitle?: string;
  color: string;
  vendorId?: string | null;
  category?: string | null;
  active: boolean;
}

const COLORS = ['#2563EB', '#0EA5E9', '#E11D48', '#22c55e', '#f59e0b', '#8b5cf6'];

export default function Promos() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [category, setCategory] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try { const { data } = await api.get<Promo[]>('/food/promos/all'); setPromos(data); }
    catch { setPromos([]); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.post('/food/promos', { title: title.trim(), subtitle: subtitle.trim() || undefined, category: category.trim() || undefined, color });
      setTitle(''); setSubtitle(''); setCategory('');
      await load();
    } catch (e: any) { alert(e?.response?.data?.message ?? 'Could not create'); }
    finally { setBusy(false); }
  }
  async function toggle(p: Promo) {
    try { await api.patch(`/food/promos/${p.id}`, { active: !p.active }); await load(); } catch {}
  }
  async function remove(p: Promo) {
    if (!confirm(`Delete "${p.title}"?`)) return;
    try { await api.delete(`/food/promos/${p.id}`); await load(); } catch {}
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 4px' }}>Promos</h1>
      <p className="muted" style={{ marginTop: 0, marginBottom: 20 }}>Promo cards shown on the customer shop carousel</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 20, alignItems: 'start' }}>
        {/* Create */}
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16 }}>New promo</h3>
          <Field label="Title" value={title} onChange={setTitle} placeholder="20% off your first order" />
          <Field label="Subtitle" value={subtitle} onChange={setSubtitle} placeholder="New to GoShop? Save on us" />
          <Field label="Category (optional)" value={category} onChange={setCategory} placeholder="e.g. Local" />
          <label className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Colour</label>
          <div style={{ display: 'flex', gap: 8, margin: '8px 0 14px' }}>
            {COLORS.map((col) => (
              <button key={col} onClick={() => setColor(col)}
                style={{ width: 30, height: 30, borderRadius: 8, background: col, border: color === col ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer' }} />
            ))}
          </div>
          {/* Live preview */}
          <div style={{ background: color, borderRadius: 16, padding: 16, marginBottom: 14 }}>
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 800 }}>{title || 'Promo title'}</div>
            <div style={{ color: 'rgba(255,255,255,.9)', fontSize: 13 }}>{subtitle || 'Subtitle'}</div>
          </div>
          <button className="btn" style={{ width: '100%' }} disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create promo'}</button>
        </div>

        {/* List */}
        <div>
          {loading ? <div className="spin" /> : promos.length === 0 ? (
            <div className="card"><p className="muted" style={{ margin: 0 }}>No promos yet.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {promos.map((p) => (
                <div key={p.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 8, alignSelf: 'stretch', borderRadius: 4, background: p.color }} />
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: 15 }}>{p.title}</strong>
                    {p.subtitle ? <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{p.subtitle}</div> : null}
                    {p.category ? <span className="badge" style={{ background: 'var(--surface-alt)', color: 'var(--text-muted)', marginTop: 6, display: 'inline-block' }}>{p.category}</span> : null}
                  </div>
                  <button className={p.active ? 'btn btn-success' : 'btn btn-ghost'} onClick={() => toggle(p)}>{p.active ? 'Active' : 'Hidden'}</button>
                  <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => remove(p)}>Delete</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label className="muted" style={{ fontSize: 13, fontWeight: 600 }}>{label}</label>
      <input className="input" style={{ marginTop: 6 }} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
