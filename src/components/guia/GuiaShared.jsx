import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';

// Componentes compartidos de la Guia de Uso (mismo design system)

export const iconBox = (bg) => ({
  width: 42, height: 42, borderRadius: 12, background: bg,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 4px 14px rgba(0,0,0,0.35)', flexShrink: 0,
});

export const cardBase = {
  background: 'linear-gradient(160deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
};

// Bloque de una seccion de la guia
export function Sec({ id, icon: Icon, color, grad, num, titulo, children }) {
  return (
    <section id={id} style={{ scrollMarginTop: '90px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', marginBottom: '0.9rem' }}>
        <div style={iconBox(grad)}><Icon size={20} color="#12121f" /></div>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color }}>
            {num}. {titulo}
          </h2>
        </div>
        <a href={`#${id}`} style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#6b7280', textDecoration: 'none' }}>#</a>
      </div>
      <div style={{ ...cardBase, padding: '1.25rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {children}
      </div>
    </section>
  );
}

// Parrafo descriptivo
export function P({ children }) {
  return <p style={{ margin: 0, fontSize: '0.88rem', color: '#d1d5db', lineHeight: 1.65 }}>{children}</p>;
}

// Subtitulo dentro de una seccion
export function H({ children }) {
  return <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{children}</div>;
}

// Paso numerado
export function Paso({ n, children }) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
      <div style={{
        width: 24, height: 24, borderRadius: 8, flexShrink: 0, marginTop: 1,
        background: 'linear-gradient(135deg, #d4af37 0%, #b8962e 100%)',
        color: '#12121f', fontWeight: '900', fontSize: '0.75rem',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{n}</div>
      <div style={{ fontSize: '0.88rem', color: '#e5e7eb', lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

// Cajas de consejo / atencion / dato
export function Tip({ tipo = 'tip', children }) {
  const cfg = {
    tip: { color: '#34d399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.35)', Icon: CheckCircle2, label: 'CONSEJO' },
    ojo: { color: '#fbbf24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.35)', Icon: AlertTriangle, label: 'ATENCION' },
    dato: { color: '#818cf8', bg: 'rgba(129,140,248,0.08)', border: 'rgba(129,140,248,0.35)', Icon: Info, label: 'DATO' },
  }[tipo];
  const { Icon } = cfg;
  return (
    <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'flex-start', background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 12, padding: '0.75rem 1rem' }}>
      <Icon size={16} color={cfg.color} style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ fontSize: '0.82rem', color: '#e5e7eb', lineHeight: 1.55 }}>
        <span style={{ fontWeight: '800', color: cfg.color, marginRight: '0.4rem' }}>{cfg.label}:</span>
        {children}
      </div>
    </div>
  );
}

// Badge de codigo de movimiento de caja
const CODIGO_CFG = {
  500: { color: '#fbbf24', label: 'En Caja' },
  501: { color: '#f87171', label: 'Egreso' },
  502: { color: '#34d399', label: 'Ingreso' },
  503: { color: '#fb923c', label: 'Retiro' },
};
export function CodeBadge({ codigo }) {
  const c = CODIGO_CFG[codigo] || { color: '#9ca3af', label: String(codigo) };
  return (
    <span style={{
      fontFamily: "'JetBrains Mono', monospace", fontSize: '0.72rem', fontWeight: '800',
      padding: '0.15rem 0.5rem', borderRadius: 8,
      background: `${c.color}22`, color: c.color, border: `1px solid ${c.color}55`,
    }}>{codigo} · {c.label}</span>
  );
}

// Tabla de ejemplo (replica visual de las tablas reales)
export function MockTable({ headers, rows, widths }) {
  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden', background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', padding: '0.55rem 0.9rem', gap: '0.75rem' }}>
        {headers.map((h, i) => (
          <div key={i} style={{ flex: widths?.[i] || 1, fontSize: '0.62rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
        ))}
      </div>
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: 'flex', padding: '0.55rem 0.9rem', gap: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
          {row.map((cell, ci) => (
            <div key={ci} style={{ flex: widths?.[ci] || 1, fontSize: '0.78rem', color: '#d1d5db', minWidth: 0 }}>{cell}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

// Flecha de flujo
export function FlowArrow() {
  return <div style={{ textAlign: 'center', color: '#d4af37', fontSize: '1.1rem', fontWeight: '900', lineHeight: 1 }}>↓</div>;
}
