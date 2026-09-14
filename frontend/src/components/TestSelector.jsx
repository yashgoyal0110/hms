import { useMemo, useState } from 'react';
import { useFetch } from '../lib/hooks.js';
import { money } from '../lib/format.js';

/** Checkbox catalogue of lab or radiology tests, grouped by section. */
export default function TestSelector({ category, value = [], onChange }) {
  const { data } = useFetch('/lab-tests', { category, limit: 500 });
  const [q, setQ] = useState('');
  const tests = data?.data || [];
  const groups = useMemo(() => {
    const m = new Map();
    tests.filter((t) => !q || `${t.name} ${t.code}`.toLowerCase().includes(q.toLowerCase())).forEach((t) => {
      if (!m.has(t.section)) m.set(t.section, []);
      m.get(t.section).push(t);
    });
    return [...m.entries()];
  }, [tests, q]);
  const selected = new Set(value);
  const total = tests.filter((t) => selected.has(t._id)).reduce((s, t) => s + t.price, 0);
  const toggle = (id) => onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div>
      <div className="row between mb-8">
        <input className="input" style={{ maxWidth: 280 }} placeholder="Filter tests" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="small"><b>{value.length}</b> selected · <b>{money(total)}</b></span>
      </div>
      <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 12px' }}>
        {groups.map(([section, list]) => (
          <div key={section} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <div className="form-section-title" style={{ border: 0, marginBottom: 4, padding: 0 }}>{section}</div>
            <div className="grid grid-2" style={{ gap: 4 }}>
              {list.map((t) => (
                <label key={t._id} className="checkbox" style={{ justifyContent: 'space-between', padding: '3px 0' }}>
                  <span className="row" style={{ gap: 7 }}><input type="checkbox" checked={selected.has(t._id)} onChange={() => toggle(t._id)} />{t.name}</span>
                  <span className="muted small mono">{money(t.price)}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
        {!groups.length && <p className="muted small" style={{ padding: 10 }}>No tests found.</p>}
      </div>
    </div>
  );
}
