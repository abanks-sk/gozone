import { useState } from 'react';
import api from '../api/client';
import { setAuth, clearAuth } from '../lib/auth';
import GzMark from '../components/GzMark';

export default function Login() {
  const [step, setStep] = useState<'creds' | 'otp'>('creds');
  const [username, setUsername] = useState('superadmin'); // seeded super admin
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submitCreds() {
    setError(''); setLoading(true);
    try {
      const { data } = await api.post('/auth/admin/login', { username: username.trim(), password });
      setPhone(data.phone);
      setStep('otp');
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Invalid username or password.');
    } finally { setLoading(false); }
  }

  async function verify() {
    setError(''); setLoading(true);
    try {
      const { data } = await api.post('/auth/verify-otp', { phone, code: code.trim() });
      if (data.role !== 'ADMIN' && data.role !== 'SUPER_ADMIN') {
        clearAuth();
        setError('This account is not an administrator.');
        return;
      }
      setAuth(data.accessToken, data.role, data.refreshToken);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Invalid or expired code.');
    } finally { setLoading(false); }
  }

  const masked = phone ? phone.replace(/.(?=.{2})/g, '•') : '';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="card" style={{ width: 380, maxWidth: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{ width: 44, height: 44, borderRadius: 13, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <GzMark size={32} white />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>GoZone Admin</div>
            <div className="muted" style={{ fontSize: 13 }}>Sign in to the console</div>
          </div>
        </div>

        {step === 'creds' ? (
          <>
            <label className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Username</label>
            <input className="input" style={{ marginTop: 6, marginBottom: 12 }} value={username}
              autoCapitalize="none" onChange={(e) => setUsername(e.target.value)} placeholder="username" />
            <label className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Password</label>
            <input className="input" style={{ marginTop: 6, marginBottom: 14 }} value={password} type="password"
              onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
              onKeyDown={(e) => { if (e.key === 'Enter') submitCreds(); }} />
            <button className="btn" style={{ width: '100%' }} disabled={loading} onClick={submitCreds}>
              {loading ? 'Checking…' : 'Continue'}
            </button>
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.5, marginTop: 14, marginBottom: 0 }}>
              We'll send a one-time code to the phone on file. Dev: <code>docker logs gozone-auth</code>.
            </p>
          </>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Enter the code sent to {masked}.</p>
            <input className="input" style={{ marginTop: 6, marginBottom: 14, letterSpacing: 4, fontSize: 18 }} value={code}
              onChange={(e) => setCode(e.target.value)} placeholder="••••••" inputMode="numeric" maxLength={6}
              onKeyDown={(e) => { if (e.key === 'Enter') verify(); }} />
            <button className="btn" style={{ width: '100%' }} disabled={loading} onClick={verify}>
              {loading ? 'Verifying…' : 'Sign in'}
            </button>
            <button className="btn-ghost" style={{ width: '100%', border: 'none', borderRadius: 999, padding: 10, marginTop: 8 }}
              onClick={() => { setStep('creds'); setCode(''); setError(''); }}>Back</button>
          </>
        )}

        {error ? <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 14, marginBottom: 0 }}>{error}</p> : null}
      </div>
    </div>
  );
}
