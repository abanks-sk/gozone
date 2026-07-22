import { useState } from 'react';
import api from '../api/client';

export default function Admins() {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function create() {
    setMsg(null);
    if (!name.trim() || !username.trim() || !password.trim() || !phone.trim()) {
      setMsg({ ok: false, text: 'All fields are required.' });
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/admins', { name: name.trim(), username: username.trim(), password, phone: phone.trim() });
      setMsg({ ok: true, text: `Admin "${username.trim()}" created. They can now log in.` });
      setName(''); setUsername(''); setPassword(''); setPhone('');
    } catch (e: any) {
      setMsg({ ok: false, text: e?.response?.data?.message ?? 'Could not create admin.' });
    } finally { setLoading(false); }
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 4px' }}>Admins</h1>
      <p className="muted" style={{ marginTop: 0, marginBottom: 20 }}>Create administrator accounts</p>

      <div className="card" style={{ maxWidth: 460 }}>
        <Field label="Full name" value={name} onChange={setName} placeholder="Ama Boateng" />
        <Field label="Username" value={username} onChange={setUsername} placeholder="ama" autoCapitalize="none" />
        <Field label="Password" value={password} onChange={setPassword} placeholder="••••••••" type="password" />
        <Field label="Phone (for OTP)" value={phone} onChange={setPhone} placeholder="+233…" />
        <button className="btn" style={{ width: '100%', marginTop: 6 }} disabled={loading} onClick={create}>
          {loading ? 'Creating…' : 'Create admin'}
        </button>
        {msg ? (
          <p style={{ color: msg.ok ? 'var(--success)' : 'var(--danger)', fontSize: 13, marginTop: 14, marginBottom: 0 }}>{msg.text}</p>
        ) : null}
      </div>

      <p className="muted" style={{ fontSize: 12.5, marginTop: 16, lineHeight: 1.5, maxWidth: 460 }}>
        New admins log in with their username + password, then a one-time code sent to this phone.
      </p>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type, autoCapitalize }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; autoCapitalize?: string;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label className="muted" style={{ fontSize: 13, fontWeight: 600 }}>{label}</label>
      <input className="input" style={{ marginTop: 6 }} value={value} type={type}
        autoCapitalize={autoCapitalize} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
