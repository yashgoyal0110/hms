// Klinvo product identity. From "klinik" (clinic): hospital operations in one flow.
export const PRODUCT = { name: 'Klinvo', tagline: 'Hospital operations platform', version: '1.0' };

export function LogoMark({ size = 32, inverted = false }) {
  const bg = inverted ? '#ffffff' : '#0f5b6e';
  const fg = inverted ? '#0f5b6e' : '#ffffff';
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill={bg} />
      <path d="M10.5 8.5v15M21.5 8.5l-7.2 7.5 7.2 7.5" fill="none" stroke={fg} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="23.6" cy="16" r="2.1" fill="#5fd0c5" />
    </svg>
  );
}

export function Wordmark({ size = 32, inverted = false, sub }) {
  return (
    <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
      <LogoMark size={size} inverted={inverted} />
      <div style={{ lineHeight: 1.15 }}>
        <div style={{ fontWeight: 700, fontSize: size * 0.56, letterSpacing: '-0.01em', color: inverted ? '#fff' : 'var(--text)' }}>{PRODUCT.name}</div>
        {sub !== false && <div style={{ fontSize: 11.5, color: inverted ? '#8fb0bb' : 'var(--muted)' }}>{sub || PRODUCT.tagline}</div>}
      </div>
    </div>
  );
}
