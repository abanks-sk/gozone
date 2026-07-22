import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

type Kind = 'DISCOUNT' | 'BOGO' | 'OTHER';
type Scope = 'VENDOR' | 'CATEGORY' | 'ITEM';

interface Promo {
  id: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  color: string;
  imageUrl?: string | null;
  vendorId?: string | null;
  category?: string | null;
  menuItemId?: string | null;
  promoKind: Kind;
  discountType?: 'PERCENT' | 'AMOUNT' | null;
  discountValue?: number | null;
  scope: Scope;
  active: boolean;
}

interface Vendor { id: string; name: string; vendorType: string }
interface Item { id: string; name: string; category?: string | null; price: number }

const COLORS = ['#2563EB', '#0EA5E9', '#E11D48', '#22c55e', '#f59e0b', '#8b5cf6'];

export default function Promos() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // form
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [imageUrl, setImageUrl] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [kind, setKind] = useState<Kind>('DISCOUNT');
  const [discType, setDiscType] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [discValue, setDiscValue] = useState('');
  const [scope, setScope] = useState<Scope>('VENDOR');
  const [category, setCategory] = useState('');
  const [menuItemId, setMenuItemId] = useState('');

  async function load() {
    setLoading(true);
    try { const { data } = await api.get<Promo[]>('/food/promos/all'); setPromos(data); }
    catch { setPromos([]); }
    finally { setLoading(false); }
    try { const { data } = await api.get<Vendor[]>('/food/restaurants'); setVendors(data); } catch {}
  }
  useEffect(() => { load(); }, []);

  // The chosen vendor's catalogue drives the category and item pickers.
  useEffect(() => {
    if (!vendorId) { setItems([]); return; }
    api.get<Item[]>(`/food/restaurants/${vendorId}/menu`)
      .then(({ data }) => setItems(data))
      .catch(() => setItems([]));
    setCategory(''); setMenuItemId('');
  }, [vendorId]);

  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category).filter(Boolean))) as string[],
    [items]);

  const vendorName = (id?: string | null) => vendors.find((v) => v.id === id)?.name ?? null;
  const itemName = (id?: string | null) => items.find((i) => i.id === id)?.name ?? null;

  function reset() {
    setTitle(''); setSubtitle(''); setDescription(''); setImageUrl('');
    setVendorId(''); setKind('DISCOUNT'); setDiscValue('');
    setScope('VENDOR'); setCategory(''); setMenuItemId('');
  }

  async function create() {
    if (!title.trim()) return alert('Give the promo a title.');
    if (kind === 'DISCOUNT') {
      if (!vendorId) return alert('A discount must belong to a business — choose one.');
      const v = Number(discValue);
      if (!v || v <= 0) return alert('Enter how much off.');
      if (discType === 'PERCENT' && v > 90) return alert('A percentage discount cannot exceed 90%.');
    }
    if (scope === 'CATEGORY' && !category) return alert('Choose a category.');
    if (scope === 'ITEM' && !menuItemId) return alert('Choose an item.');

    setBusy(true);
    try {
      await api.post('/food/promos', {
        title: title.trim(),
        subtitle: subtitle.trim() || undefined,
        description: description.trim() || undefined,
        color,
        imageUrl: imageUrl.trim() || undefined,
        vendorId: vendorId || undefined,
        promoKind: kind,
        scope,
        ...(kind === 'DISCOUNT' ? { discountType: discType, discountValue: Number(discValue) } : {}),
        ...(scope === 'CATEGORY' ? { category } : {}),
        ...(scope === 'ITEM' ? { menuItemId } : {}),
      });
      reset();
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

  const pending = promos.filter((p) => !p.active);

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 4px' }}>Promos</h1>
      <p className="muted" style={{ marginTop: 0, marginBottom: 20 }}>
        Cards on the customer shop carousel. <strong>Discounts</strong> are applied by GoZone at checkout;
        other offers are honoured by the vendor and only shown on the order.
        Activating a vendor's application is how you approve it.
      </p>

      {pending.length > 0 && (
        <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--warning, #f59e0b)' }}>
          <strong style={{ fontSize: 15 }}>{pending.length} awaiting approval</strong>
          <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
            Vendor applications appear below as “Hidden”. Review the terms, then activate to approve.
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 20, alignItems: 'start' }}>
        {/* ── Create ── */}
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16 }}>New promo</h3>

          <Field label="Title" value={title} onChange={setTitle} placeholder="20% off this weekend" />
          <Field label="Subtitle" value={subtitle} onChange={setSubtitle} placeholder="Kofi Kitchen" />

          <label className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Type</label>
          <select className="input" style={{ marginTop: 6, marginBottom: 12 }} value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="DISCOUNT">Discount — GoZone takes it off at checkout</option>
            <option value="BOGO">Buy 1 get 1 — vendor honours it</option>
            <option value="OTHER">Other offer — vendor honours it</option>
          </select>

          {kind === 'DISCOUNT' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <select className="input" style={{ width: 110 }} value={discType}
                onChange={(e) => setDiscType(e.target.value as any)}>
                <option value="PERCENT">%</option>
                <option value="AMOUNT">GH₵</option>
              </select>
              <input className="input" style={{ flex: 1 }} value={discValue} inputMode="decimal"
                onChange={(e) => setDiscValue(e.target.value)}
                placeholder={discType === 'PERCENT' ? '20' : '5.00'} />
            </div>
          )}

          {kind !== 'DISCOUNT' && (
            <Field label="Terms shown to the customer" value={description} onChange={setDescription}
              placeholder="On any main, dine-in only" />
          )}

          <label className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Business</label>
          <select className="input" style={{ marginTop: 6, marginBottom: 12 }} value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}>
            <option value="">— none (generic announcement) —</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.vendorType}</option>)}
          </select>

          <label className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Applies to / links to</label>
          <select className="input" style={{ marginTop: 6, marginBottom: 12 }} value={scope}
            onChange={(e) => setScope(e.target.value as Scope)} disabled={!vendorId}>
            <option value="VENDOR">Their entire menu / catalogue</option>
            <option value="CATEGORY">One category</option>
            <option value="ITEM">One item</option>
          </select>

          {scope === 'CATEGORY' && (
            <select className="input" style={{ marginBottom: 12 }} value={category}
              onChange={(e) => setCategory(e.target.value)}>
              <option value="">— choose a category —</option>
              {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          )}
          {scope === 'ITEM' && (
            <select className="input" style={{ marginBottom: 12 }} value={menuItemId}
              onChange={(e) => setMenuItemId(e.target.value)}>
              <option value="">— choose an item —</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name} — GH₵ {i.price.toFixed(2)}</option>)}
            </select>
          )}

          <Field label="Background image URL (optional)" value={imageUrl} onChange={setImageUrl}
            placeholder="https://…/jollof.jpg" />

          <label className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Colour (used when there's no image)</label>
          <div style={{ display: 'flex', gap: 8, margin: '8px 0 14px' }}>
            {COLORS.map((col) => (
              <button key={col} onClick={() => setColor(col)}
                style={{ width: 30, height: 30, borderRadius: 8, background: col, border: color === col ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer' }} />
            ))}
          </div>

          {/* Live preview — mirrors the customer card */}
          <div style={{
            borderRadius: 16, padding: 16, marginBottom: 14, minHeight: 96,
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            background: imageUrl.trim()
              ? `linear-gradient(rgba(0,0,0,.42), rgba(0,0,0,.42)), url(${imageUrl.trim()}) center/cover`
              : color,
          }}>
            {kind === 'DISCOUNT' && discValue ? (
              <span style={{ alignSelf: 'flex-start', background: 'rgba(255,255,255,.22)', color: '#fff', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
                {discType === 'PERCENT' ? `${discValue}% off` : `GH₵${discValue} off`}
              </span>
            ) : null}
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 800 }}>{title || 'Promo title'}</div>
            <div style={{ color: 'rgba(255,255,255,.9)', fontSize: 13 }}>{subtitle || 'Subtitle'}</div>
          </div>

          <button className="btn" style={{ width: '100%' }} disabled={busy} onClick={create}>
            {busy ? 'Creating…' : 'Create promo'}
          </button>
        </div>

        {/* ── List ── */}
        <div>
          {loading ? <div className="spin" /> : promos.length === 0 ? (
            <div className="card"><p className="muted" style={{ margin: 0 }}>No promos yet.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {promos.map((p) => (
                <div key={p.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{
                    width: 48, alignSelf: 'stretch', borderRadius: 8, minHeight: 48,
                    background: p.imageUrl ? `url(${p.imageUrl}) center/cover` : p.color,
                  }} />
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: 15 }}>{p.title}</strong>
                    {p.subtitle ? <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{p.subtitle}</div> : null}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      <span className="badge" style={{ background: p.promoKind === 'DISCOUNT' ? 'var(--primary)' : 'var(--surface-alt)', color: p.promoKind === 'DISCOUNT' ? '#fff' : 'var(--text-muted)' }}>
                        {p.promoKind === 'DISCOUNT'
                          ? (p.discountType === 'PERCENT' ? `${p.discountValue}% off` : `GH₵${p.discountValue} off`)
                          : p.promoKind === 'BOGO' ? 'Buy 1 get 1' : 'Vendor offer'}
                      </span>
                      <span className="badge" style={{ background: 'var(--surface-alt)', color: 'var(--text-muted)' }}>
                        {p.scope === 'ITEM' ? (itemName(p.menuItemId) ?? 'one item')
                          : p.scope === 'CATEGORY' ? (p.category ?? 'a category')
                          : 'whole catalogue'}
                      </span>
                      {vendorName(p.vendorId) ? (
                        <span className="badge" style={{ background: 'var(--surface-alt)', color: 'var(--text-muted)' }}>{vendorName(p.vendorId)}</span>
                      ) : null}
                    </div>
                    {p.description ? <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>{p.description}</div> : null}
                  </div>
                  <button className={p.active ? 'btn btn-success' : 'btn btn-ghost'} onClick={() => toggle(p)}>
                    {p.active ? 'Active' : 'Approve'}
                  </button>
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
