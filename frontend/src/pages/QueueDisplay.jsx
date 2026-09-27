import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { PRODUCT } from '../components/Brand.jsx';

export default function QueueDisplay() {
  const [data, setData] = useState({ doctors: [] });
  const [info, setInfo] = useState(null);
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    api.get('/public/info').then(setInfo).catch(() => {});
    const load = () => api.get('/public/queue').then(setData).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    const c = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(t); clearInterval(c); };
  }, []);
  return (
    <div className="queue-display">
      <header>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{info?.hospital?.name || 'OPD'}</div>
          <div style={{ color: '#7f97a1' }}>Outpatient token status</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 30, fontWeight: 600 }} className="mono">{now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
          <div style={{ color: '#7f97a1' }}>{now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>
      </header>
      {!data.doctors.length && <div style={{ color: '#7f97a1', fontSize: 18, marginTop: 80, textAlign: 'center' }}>No patients in queue at the moment.</div>}
      <div style={{ position: 'fixed', right: 24, bottom: 16, color: '#4f7482', fontSize: 12 }}>Powered by {PRODUCT.name}</div>
      <div className="queue-cards">
        {data.doctors.map((d) => (
          <div className="queue-card" key={d.doctor}>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{d.doctor}</div>
            <div style={{ color: '#8fb0bb', fontSize: 13 }}>{d.department || d.specialization}</div>
            <div style={{ color: '#8fb0bb', fontSize: 12, marginTop: 14, textTransform: 'uppercase', letterSpacing: '.08em' }}>Now consulting</div>
            <div className="now">{d.current ? `#${d.current.token}` : '-'}</div>
            <div style={{ color: '#8fb0bb', fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.08em' }}>Next</div>
            <div className="next">{d.waiting.length ? d.waiting.slice(0, 8).map((w) => <span key={w.token}>#{w.token}</span>) : <span style={{ background: 'none', color: '#8fb0bb' }}>-</span>}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
