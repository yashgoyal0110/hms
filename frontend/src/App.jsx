import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import Layout from './components/Layout.jsx';
import { Loading } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import QueueDisplay from './pages/QueueDisplay.jsx';
import Pending from './pages/Pending.jsx';
import { routes } from './routes.jsx';

function RequireAuth({ children }) {
  const { ready, user } = useAuth();
  const location = useLocation();
  if (!ready) return <Loading label="Starting…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

function Guard({ module, children }) {
  const { can } = useAuth();
  if (module && !can(module)) {
    return <Pending title="Access restricted" />;
  }
  return children;
}

export default function App() {
  const { ready, user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={ready && user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/display/queue" element={<QueueDisplay />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        {routes.map((r) => (
          <Route key={r.path} path={r.path} element={<Guard module={r.module}>{r.element}</Guard>} />
        ))}
        <Route path="*" element={<Pending title="Page not found" />} />
      </Route>
    </Routes>
  );
}
