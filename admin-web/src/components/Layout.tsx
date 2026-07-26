import { ReactNode } from 'react';
import { clearAuth, getRefreshToken } from '../lib/auth';
import api from '../api/client';
import GzMark from './GzMark';
import type { Page } from '../App';

const NAV: { key: Page; label: string; icon: string; superOnly?: boolean }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '◈' },
  { key: 'approvals', label: 'Approvals', icon: '✓' },
  { key: 'kyc', label: 'Driver KYC', icon: '🪪' },
  { key: 'promos', label: 'Promos', icon: '🎟️' },
  { key: 'fees', label: 'Fees', icon: '💵' },
  { key: 'payouts', label: 'Payouts', icon: '🏧' },
  { key: 'incidents', label: 'Incidents', icon: '🚨' },
  { key: 'admins', label: 'Admins', icon: '👤', superOnly: true },
];

export default function Layout({ page, onNavigate, isSuper, children }: { page: Page; onNavigate: (p: Page) => void; isSuper: boolean; children: ReactNode }) {
  const nav = NAV.filter((n) => !n.superOnly || isSuper);

  // Tell the server to revoke the refresh token, so signing out really ends the session
  // instead of only forgetting it in this browser. Clearing locally happens either way.
  async function signOut() {
    const refreshToken = getRefreshToken();
    try {
      if (refreshToken) await api.post('/auth/logout', { refreshToken });
    } catch { /* the session is over locally regardless */ }
    clearAuth();
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside style={{ width: 240, borderRight: '1px solid var(--border)', background: 'var(--surface)', padding: 20, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{ width: 36, height: 36, borderRadius: 11, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <GzMark size={26} white />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>GoZone</div>
            <div className="muted" style={{ fontSize: 11.5 }}>{isSuper ? 'Super admin' : 'Admin console'}</div>
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {nav.map((n) => {
            const active = page === n.key;
            return (
              <button key={n.key} onClick={() => onNavigate(n.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderRadius: 12, border: 'none',
                  textAlign: 'left', fontSize: 14, fontWeight: 600,
                  background: active ? 'var(--primary-soft)' : 'transparent',
                  color: active ? 'var(--text)' : 'var(--text-muted)',
                }}>
                <span style={{ width: 18, textAlign: 'center' }}>{n.icon}</span>{n.label}
              </button>
            );
          })}
        </nav>

        <div style={{ flex: 1 }} />
        <button className="btn-ghost" style={{ border: 'none', borderRadius: 12, padding: '11px 13px', textAlign: 'left', fontSize: 14, fontWeight: 600, color: 'var(--danger)' }}
          onClick={signOut}>Sign out</button>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, padding: '32px 40px', maxWidth: 1100 }}>{children}</main>
    </div>
  );
}
