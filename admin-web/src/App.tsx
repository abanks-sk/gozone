import { useEffect, useState } from 'react';
import { getToken, getRole } from './lib/auth';
import Login from './pages/Login';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Kyc from './pages/Kyc';
import Approvals from './pages/Approvals';
import Admins from './pages/Admins';
import Promos from './pages/Promos';
import Fees from './pages/Fees';
import Incidents from './pages/Incidents';
import Payouts from './pages/Payouts';

export type Page = 'dashboard' | 'approvals' | 'kyc' | 'promos' | 'fees' | 'payouts' | 'incidents' | 'admins';

function isAdmin() {
  const r = getRole();
  return !!getToken() && (r === 'ADMIN' || r === 'SUPER_ADMIN');
}

export default function App() {
  const [authed, setAuthed] = useState(isAdmin);
  const [page, setPage] = useState<Page>('dashboard');

  useEffect(() => {
    const onChange = () => setAuthed(isAdmin());
    window.addEventListener('gozone-auth-changed', onChange);
    return () => window.removeEventListener('gozone-auth-changed', onChange);
  }, []);

  if (!authed) return <Login />;

  const isSuper = getRole() === 'SUPER_ADMIN';

  return (
    <Layout page={page} onNavigate={setPage} isSuper={isSuper}>
      {page === 'dashboard' && <Dashboard onReviewKyc={() => setPage('kyc')} onApprovals={() => setPage('approvals')} />}
      {page === 'approvals' && <Approvals />}
      {page === 'kyc' && <Kyc />}
      {page === 'promos' && <Promos />}
      {page === 'fees' && <Fees />}
      {page === 'payouts' && <Payouts />}
      {page === 'incidents' && <Incidents />}
      {page === 'admins' && (isSuper ? <Admins /> : <Dashboard onReviewKyc={() => setPage('kyc')} onApprovals={() => setPage('approvals')} />)}
    </Layout>
  );
}
