import { useEffect, useState } from 'react';
import api from '../api/client';

interface PlatformFees {
  serviceFeePct: number;   // fraction, e.g. 0.05
  deliveryBaseFee: number;
  deliveryPerKm: number;
}

export default function Fees() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [servicePct, setServicePct] = useState('');  // shown as a percentage
  const [base, setBase] = useState('');
  const [perKm, setPerKm] = useState('');

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get<PlatformFees>('/food/platform-fees');
      setServicePct(String(+(data.serviceFeePct * 100).toFixed(2)));
      setBase(String(data.deliveryBaseFee));
      setPerKm(String(data.deliveryPerKm));
    } catch { /* leave blank */ }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setBusy(true);
    try {
      await api.patch('/food/platform-fees', {
        serviceFeePct: (Number(servicePct) || 0) / 100,
        deliveryBaseFee: Number(base) || 0,
        deliveryPerKm: Number(perKm) || 0,
      });
      alert('Fees updated.');
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Could not save');
    } finally { setBusy(false); }
  }

  // Live example on a GH₵50 delivery order 4 km away.
  const exSubtotal = 50;
  const exService = exSubtotal * (Number(servicePct) || 0) / 100;
  const exDelivery = (Number(base) || 0) + (Number(perKm) || 0) * 4;

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 4px' }}>Fees</h1>
      <p className="muted" style={{ marginTop: 0, marginBottom: 20 }}>
        Platform fees added on top of vendor food prices. Applied to every order.
      </p>

      {loading ? <div className="spin" /> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
          <div className="card">
            <h3 style={{ marginTop: 0, fontSize: 16 }}>Service fee</h3>
            <Field label="Service fee (% of food subtotal)" value={servicePct} onChange={setServicePct} placeholder="5" suffix="%" />

            <h3 style={{ fontSize: 16, marginTop: 20 }}>Delivery fee (distance-based)</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>fee = base + per-km × distance (vendor → customer)</p>
            <Field label="Base fee" value={base} onChange={setBase} placeholder="2.00" prefix="GH₵" />
            <Field label="Per kilometre" value={perKm} onChange={setPerKm} placeholder="1.50" prefix="GH₵" />

            <button className="btn" style={{ width: '100%', marginTop: 8 }} disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save fees'}
            </button>
          </div>

          {/* Example */}
          <div className="card">
            <h3 style={{ marginTop: 0, fontSize: 16 }}>Example</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>A GH₵{exSubtotal.toFixed(2)} delivery order, 4 km away:</p>
            <Line label="Food subtotal" value={exSubtotal} />
            <Line label={`Service fee (${servicePct || 0}%)`} value={exService} />
            <Line label="Delivery fee (4 km)" value={exDelivery} />
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
              <span>Total</span><span>GH₵ {(exSubtotal + exService + exDelivery).toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, prefix, suffix }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; prefix?: string; suffix?: string;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label className="muted" style={{ fontSize: 13, fontWeight: 600 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        {prefix ? <span className="muted" style={{ fontSize: 14 }}>{prefix}</span> : null}
        <input className="input" style={{ flex: 1 }} inputMode="decimal" value={value}
          onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        {suffix ? <span className="muted" style={{ fontSize: 14 }}>{suffix}</span> : null}
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
      <span className="muted">{label}</span><span>GH₵ {value.toFixed(2)}</span>
    </div>
  );
}
