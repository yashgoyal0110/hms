import { useAuth } from '../lib/auth.jsx';

/** Hospital letterhead wrapper for printable documents. */
export default function PrintDoc({ title, children, footer }) {
  const { settings } = useAuth();
  return (
    <div className="doc">
      <div className="doc-head">
        <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
          <svg width="40" height="40" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#0f5b6e" /><path d="M13 6h6v7h7v6h-7v7h-6v-7H6v-6h7z" fill="#fff" /></svg>
          <div>
            <div className="h-name">{settings?.name}</div>
            <div className="h-sub">{settings?.address}</div>
            <div className="h-sub">{[settings?.phone && `Ph: ${settings.phone}`, settings?.email, settings?.website].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
        <div className="h-sub" style={{ textAlign: 'right' }}>
          {settings?.registrationNo && <div>Reg. No: {settings.registrationNo}</div>}
          {settings?.gstin && <div>GSTIN: {settings.gstin}</div>}
        </div>
      </div>
      {title && <div className="doc-title">{title}</div>}
      {children}
      <div className="doc-foot">{footer || settings?.invoiceFooter} · Printed on {new Date().toLocaleString('en-IN')}</div>
    </div>
  );
}
