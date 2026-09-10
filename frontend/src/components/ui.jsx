import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Inbox, ChevronLeft, ChevronRight, AlertTriangle, Loader2,
} from 'lucide-react';

export function PageHeader({ title, sub, actions, crumbs }) {
  return (
    <div className="page-header">
      <div>
        {crumbs && <div className="breadcrumb">{crumbs}</div>}
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, flush, className = '', bodyClass = '' }) {
  return (
    <div className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-header">
          {typeof title === 'string' ? <h3>{title}</h3> : title}
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      <div className={`card-body ${flush ? 'flush' : ''} ${bodyClass}`}>{children}</div>
    </div>
  );
}

export function Stat({ label, value, foot, icon: Icon, tone }) {
  return (
    <div className="card stat">
      <div className="label">{Icon && <Icon />} {label}</div>
      <div className={`value ${tone ? `${tone}-text` : ''}`}>{value}</div>
      {foot && <div className="foot">{foot}</div>}
    </div>
  );
}

const STATUS_TONES = {
  success: ['Completed', 'Paid', 'Available', 'Discharged', 'Settled', 'Approved', 'Received', 'Sent', 'Active', 'In Stock'],
  warning: ['Checked-in', 'Partially Paid', 'Cleaning', 'Sample Collected', 'Under Review', 'Query Raised', 'Partially Approved', 'Draft', 'Postponed', 'Logged', 'Low Stock', 'Urgent', 'LAMA'],
  info: ['Scheduled', 'In-consultation', 'In Progress', 'Submitted', 'Ordered', 'Reserved', 'Open', 'Admitted', 'In Use', 'Queued'],
  danger: ['Cancelled', 'No-show', 'Unpaid', 'Rejected', 'Occupied', 'Failed', 'Expired', 'STAT', 'Critical', 'Out of Stock', 'Inactive'],
};
export function StatusBadge({ status, tone }) {
  const t = tone || Object.entries(STATUS_TONES).find(([, list]) => list.includes(status))?.[0] || '';
  return <span className={`badge ${t}`}>{status}</span>;
}
export function Badge({ children, tone = '', plain = true }) {
  return <span className={`badge ${tone} ${plain ? 'plain' : ''}`}>{children}</span>;
}

export function Button({ variant, size, icon: Icon, loading, children, className = '', ...rest }) {
  const cls = ['btn', variant && `btn-${variant}`, size && `btn-${size}`, !children && Icon && 'btn-icon', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Loader2 className="spin" /> : Icon && <Icon />}
      {children}
    </button>
  );
}

export function Modal({ open, onClose, title, children, footer, size, printable }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    if (printable) document.body.classList.add('printing-modal');
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('printing-modal'); };
  }, [open, onClose, printable]);
  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal ${size || ''}`} role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Confirm({ open, title = 'Are you sure?', message, confirmLabel = 'Confirm', danger, onConfirm, onClose, children }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger-solid' : 'primary'} loading={busy} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}>{confirmLabel}</Button>
        </>
      )}
    >
      {message && <p>{message}</p>}
      {children}
    </Modal>
  );
}

export function Field({ label, required, hint, children, className = '' }) {
  return (
    <div className={`field ${className}`}>
      {label && <label>{label}{required && <span className="req">*</span>}</label>}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Select({ options = [], placeholder, ...rest }) {
  return (
    <select className="select" {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (typeof o === 'string'
        ? <option key={o} value={o}>{o}</option>
        : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}

export function Empty({ icon: Icon = Inbox, title = 'Nothing here yet', children }) {
  return (
    <div className="empty">
      <Icon />
      <div className="strong" style={{ color: 'var(--text-2)' }}>{title}</div>
      {children && <div className="small mt-8">{children}</div>}
    </div>
  );
}

export function Loading({ label = 'Loading…' }) {
  return <div className="empty"><Loader2 className="spin" /><div>{label}</div></div>;
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="alert danger"><AlertTriangle />{error.message || String(error)}</div>;
}

export function Pagination({ page, pages, total, onPage }) {
  if (!total) return null;
  return (
    <div className="pagination">
      <span>{total.toLocaleString('en-IN')} record{total === 1 ? '' : 's'}</span>
      <div className="row">
        <span>Page {page} of {pages}</span>
        <Button size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page" />
        <Button size="sm" icon={ChevronRight} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page" />
      </div>
    </div>
  );
}

/**
 * Generic table. columns: [{ key, label, render(row), className, align }]
 */
export function DataTable({ columns, rows, loading, onRowClick, empty = 'No records found', footer, rowKey = '_id' }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>{columns.map((c) => <th key={c.key || c.label} className={c.align === 'right' ? 'num' : ''} style={c.width ? { width: c.width } : undefined}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {loading && !rows?.length && <tr><td colSpan={columns.length}><Loading /></td></tr>}
          {!loading && !rows?.length && <tr><td colSpan={columns.length}><Empty title={empty} /></td></tr>}
          {rows?.map((r, i) => (
            <tr key={r[rowKey] || i} className={onRowClick ? 'clickable' : ''} onClick={onRowClick ? () => onRowClick(r) : undefined}>
              {columns.map((c) => (
                <td key={c.key || c.label} className={[c.align === 'right' ? 'num' : '', c.className || ''].join(' ')}>
                  {c.render ? c.render(r, i) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer}
      </table>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button type="button" key={t.value} className={`tab ${value === t.value ? 'active' : ''}`} onClick={() => onChange(t.value)}>
          {t.label}{t.count !== undefined && t.count !== null && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Dropdown({ trigger, children, align = 'right', className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div className="dropdown" ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div className={`dropdown-menu ${className}`} style={align === 'left' ? { left: 0, right: 'auto' } : undefined} onClick={(e) => { if (e.target.closest('[data-close]')) setOpen(false); }}>
          {typeof children === 'function' ? children({ close: () => setOpen(false) }) : children}
        </div>
      )}
    </div>
  );
}

export function KV({ items }) {
  return (
    <dl className="kv">
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v === undefined || v === null || v === '' ? '-' : v}</dd></div>
      ))}
    </dl>
  );
}
