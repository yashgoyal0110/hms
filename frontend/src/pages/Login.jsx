import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Stethoscope, BedDouble, FlaskConical, Pill, Receipt, ShieldCheck, BarChart3, CalendarClock,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Button, ErrorBox, Field } from '../components/ui.jsx';
import { LogoMark, PRODUCT, Wordmark } from '../components/Brand.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [info, setInfo] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get('/public/info').then(setInfo).catch(() => {}); }, []);

  const submit = async (e, creds) => {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(creds?.email ?? email, creds?.password ?? password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const fill = (a) => { setEmail(a.email); setPassword(a.password); setError(null); };
  const hospital = info?.hospital?.name;

  return (
    <div className="login-page">
      <aside className="login-aside">
        <Wordmark size={38} inverted />
        <div>
          <h1>Run every department of your hospital on one platform.</h1>
          <p>Registration, clinical records, admissions, diagnostics, pharmacy, billing and accounts on a single secure platform.</p>
          <ul>
            <li><CalendarClock />Appointments & token queue</li>
            <li><Stethoscope />OPD consultations & EMR</li>
            <li><BedDouble />IPD, wards & bed board</li>
            <li><FlaskConical />Laboratory & radiology</li>
            <li><Pill />Pharmacy & inventory</li>
            <li><Receipt />Billing & insurance claims</li>
            <li><BarChart3 />Reports & analytics</li>
            <li><ShieldCheck />Role-based access & audit</li>
          </ul>
        </div>
        <div style={{ fontSize: 12, color: '#6c8792' }}>{hospital ? `${hospital}${info?.hospital?.phone ? ` · Helpdesk ${info.hospital.phone}` : ''}` : ' '}</div>
      </aside>

      <main className="login-main">
        <div className="login-box">
          <div className="login-mobile-brand"><LogoMark size={36} /><b>{PRODUCT.name}</b></div>
          <h2>Sign in</h2>
          <p className="muted" style={{ marginBottom: 22 }}>{hospital ? `Staff sign-in for ${hospital}` : 'Use your staff credentials to continue.'}</p>
          <form onSubmit={submit} className="stack" style={{ gap: 14 }}>
            <ErrorBox error={error} />
            <Field label="Email address">
              <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </Field>
            <Field label="Password">
              <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            <Button type="submit" variant="primary" className="btn-block" loading={busy} style={{ height: 38 }}>Sign in</Button>
          </form>

          {info?.demoMode && info.demoAccounts?.length > 0 && (
            <>
              <div className="divider">Demo access</div>
              <p className="muted small" style={{ marginBottom: 10 }}>Select a role to fill in its demo credentials, then sign in.</p>
              <div className="demo-grid">
                {info.demoAccounts.map((a) => (
                  <button type="button" key={a.email} className="demo-btn" onClick={() => fill(a)} onDoubleClick={() => submit(null, a)} title="Click to fill, double-click to sign in">
                    <b>{a.role}</b>
                    <span>{a.email}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="muted small" style={{ marginTop: 28 }}>Access is monitored and recorded. Unauthorised use is prohibited.</p>
        </div>
      </main>
    </div>
  );
}
