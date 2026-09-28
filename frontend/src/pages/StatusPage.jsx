import { Link } from 'react-router-dom';
import { Lock, Compass } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';

/** Friendly screens for routes a user cannot open. */
export default function StatusPage({ kind }) {
  const { roleLabel } = useAuth();
  const denied = kind === 'denied';
  const Icon = denied ? Lock : Compass;
  return (
    <div className="card" style={{ padding: '48px 24px', textAlign: 'center', maxWidth: 560, margin: '40px auto' }}>
      <Icon size={30} color="var(--primary)" />
      <h2 style={{ marginTop: 12 }}>{denied ? 'Access restricted' : 'Page not found'}</h2>
      <p className="muted" style={{ marginTop: 8 }}>
        {denied
          ? `Your role (${roleLabel}) does not include access to this section. Contact your administrator if you need it.`
          : 'The page you are looking for does not exist or may have moved.'}
      </p>
      <Link to="/" className="btn btn-primary" style={{ marginTop: 18 }}>Go to dashboard</Link>
    </div>
  );
}
