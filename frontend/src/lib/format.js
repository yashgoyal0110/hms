let currency = '₹';
export function setCurrency(c) { currency = c || '₹'; }

const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export const money = (n) => `${currency}${inr.format(Number(n) || 0)}`;
export const money0 = (n) => `${currency}${inr0.format(Math.round(Number(n) || 0))}`;
export const num = (n) => inr0.format(Number(n) || 0);
export const compactMoney = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e7) return `${currency}${(v / 1e7).toFixed(2)} Cr`;
  if (Math.abs(v) >= 1e5) return `${currency}${(v / 1e5).toFixed(2)} L`;
  if (Math.abs(v) >= 1e3) return `${currency}${(v / 1e3).toFixed(1)}K`;
  return `${currency}${v.toFixed(0)}`;
};

export function date(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
export function dateTime(d) {
  if (!d) return '-';
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}
export function time(d) {
  if (!d) return '-';
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}
export function slot12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
export function isoDate(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function ago(d) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function ageOf(dob) {
  if (!dob) return null;
  const ms = Date.now() - new Date(dob).getTime();
  const years = Math.floor(ms / (365.25 * 86400000));
  if (years >= 1) return `${years}y`;
  const months = Math.floor(ms / (30.44 * 86400000));
  return months >= 1 ? `${months}m` : `${Math.floor(ms / 86400000)}d`;
}
export const fullName = (p) => (p ? [p.firstName, p.lastName].filter(Boolean).join(' ') : '-');
export const ageSex = (p) => (p ? [ageOf(p.dob), p.gender?.[0]].filter(Boolean).join(' / ') : '');
export const initials = (name = '') => name.replace(/^Dr\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();

export function toCsv(rows, columns) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(',')).join('\n');
  return `${head}\n${body}`;
}
export function downloadCsv(filename, rows, columns) {
  const blob = new Blob([`﻿${toCsv(rows, columns)}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
