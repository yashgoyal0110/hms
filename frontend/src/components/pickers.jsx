import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../lib/api.js';
import { ageSex, fullName } from '../lib/format.js';
import { useDebounced, useFetch } from '../lib/hooks.js';

/** Async patient search. value = patient object | null */
export function PatientPicker({ value, onChange, placeholder = 'Search by name, UHID or phone', autoFocus, disabled }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(0);
  const dq = useDebounced(q, 250);
  useEffect(() => {
    if (!dq.trim()) { setList([]); return; }
    api.get('/patients', { q: dq, limit: 10 }).then((r) => { setList(r.data); setHl(0); }).catch(() => setList([]));
  }, [dq]);
  if (value) {
    return (
      <div className="combo-selected">
        <div>
          <div className="cell-main">{fullName(value)} <span className="muted small">· {value.uhid}</span></div>
          <div className="cell-sub">{ageSex(value)}{value.phone ? ` · ${value.phone}` : ''}</div>
        </div>
        {!disabled && <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => onChange(null)} aria-label="Clear"><X size={14} /></button>}
      </div>
    );
  }
  const choose = (p) => { onChange(p); setQ(''); setOpen(false); };
  return (
    <div className="combo">
      <input
        className="input"
        value={q}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHl((h) => Math.min(h + 1, list.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHl((h) => Math.max(h - 1, 0)); }
          if (e.key === 'Enter' && list[hl]) { e.preventDefault(); choose(list[hl]); }
        }}
      />
      {open && q && (
        <div className="combo-list">
          {!list.length && <div className="combo-item muted">No matching patients</div>}
          {list.map((p, i) => (
            <div key={p._id} className={`combo-item ${i === hl ? 'hl' : ''}`} onMouseDown={() => choose(p)}>
              <div className="cell-main">{p.fullName} <span className="muted small">· {p.uhid}</span></div>
              <div className="cell-sub">{ageSex(p)} · {p.phone}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Staff directory select (doctors by default). */
export function StaffSelect({ role = 'doctor', value, onChange, placeholder = 'Select', department, includeAll, ...rest }) {
  const { data } = useFetch('/users/directory', { role, department });
  return (
    <select className="select" value={value || ''} onChange={(e) => onChange(e.target.value, data?.find((u) => u._id === e.target.value))} {...rest}>
      <option value="">{includeAll ? 'All' : placeholder}</option>
      {(data || []).map((u) => (
        <option key={u._id} value={u._id}>{u.name}{u.specialization ? ` - ${u.specialization}` : u.designation ? ` - ${u.designation}` : ''}</option>
      ))}
    </select>
  );
}

export function DepartmentSelect({ value, onChange, placeholder = 'Select department', type, includeAll, ...rest }) {
  const { data } = useFetch('/departments', { type, limit: 200 });
  return (
    <select className="select" value={value || ''} onChange={(e) => onChange(e.target.value)} {...rest}>
      <option value="">{includeAll ? 'All departments' : placeholder}</option>
      {(data?.data || []).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
    </select>
  );
}

/** Multi-select list of tags entered as comma separated text. */
export function TagInput({ value = [], onChange, placeholder }) {
  const [text, setText] = useState('');
  const ref = useRef(null);
  const add = () => {
    const parts = text.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) onChange([...new Set([...value, ...parts])]);
    setText('');
  };
  return (
    <div className="input" style={{ height: 'auto', minHeight: 34, display: 'flex', flexWrap: 'wrap', gap: 4, padding: 4, alignItems: 'center' }} onClick={() => ref.current?.focus()}>
      {value.map((t) => (
        <span key={t} className="tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {t}
          <X size={12} style={{ cursor: 'pointer' }} onClick={() => onChange(value.filter((x) => x !== t))} />
        </span>
      ))}
      <input
        ref={ref}
        value={text}
        placeholder={value.length ? '' : placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1)); }}
        onBlur={add}
        style={{ border: 0, outline: 0, flex: 1, minWidth: 120, padding: '4px 6px', background: 'transparent' }}
      />
    </div>
  );
}
