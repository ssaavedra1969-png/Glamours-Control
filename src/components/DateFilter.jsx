import { useState } from 'react';
import { format, subDays, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import { Calendar, ChevronDown, ChevronUp } from 'lucide-react';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => currentYear - i);

function toStr(d) { return format(d, 'yyyy-MM-dd'); }

const PRESETS = [
  { label: 'Hoy', get: () => ({ from: toStr(new Date()), to: toStr(new Date()) }) },
  { label: 'Ayer', get: () => { const d = subDays(new Date(), 1); return { from: toStr(d), to: toStr(d) }; } },
  { label: 'Esta semana', get: () => ({ from: toStr(startOfWeek(new Date(), { weekStartsOn: 1 })), to: toStr(endOfWeek(new Date(), { weekStartsOn: 1 })) }) },
  { label: 'Semana pasada', get: () => { const d = subDays(new Date(), 7); return { from: toStr(startOfWeek(d, { weekStartsOn: 1 })), to: toStr(endOfWeek(d, { weekStartsOn: 1 })) }; } },
  { label: 'Este mes', get: () => ({ from: toStr(startOfMonth(new Date())), to: toStr(endOfMonth(new Date())) }) },
  { label: 'Mes pasado', get: () => { const d = subMonths(new Date(), 1); return { from: toStr(startOfMonth(d)), to: toStr(endOfMonth(d)) }; } },
  { label: 'Ultimos 7 dias', get: () => ({ from: toStr(subDays(new Date(), 6)), to: toStr(new Date()) }) },
  { label: 'Ultimos 14 dias', get: () => ({ from: toStr(subDays(new Date(), 13)), to: toStr(new Date()) }) },
  { label: 'Ultimos 30 dias', get: () => ({ from: toStr(subDays(new Date(), 29)), to: toStr(new Date()) }) },
  { label: 'Ultimos 90 dias', get: () => ({ from: toStr(subDays(new Date(), 89)), to: toStr(new Date()) }) },
  { label: 'Este anio', get: () => ({ from: toStr(startOfYear(new Date())), to: toStr(endOfYear(new Date())) }) },
  { label: 'Todo', get: () => ({ from: '', to: '' }) },
];

export default function DateFilter({ dateFrom, dateTo, onChange }) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState('rango');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedDay, setSelectedDay] = useState('');

  const applyPreset = (preset) => {
    const { from, to } = preset.get();
    onChange(from, to);
    setExpanded(false);
  };

  const applyMonthYear = () => {
    const d = new Date(selectedYear, selectedMonth, 1);
    onChange(toStr(startOfMonth(d)), toStr(endOfMonth(d)));
    setExpanded(false);
  };

  const applyYear = () => {
    const d = new Date(selectedYear, 0, 1);
    onChange(toStr(startOfYear(d)), toStr(endOfYear(d)));
    setExpanded(false);
  };

  const applyDay = () => {
    if (selectedDay) {
      onChange(selectedDay, selectedDay);
      setExpanded(false);
    }
  };

  const quickPresets = PRESETS.slice(0, 6);

  const dateInputStyle = {
    fontSize: '0.8rem',
    padding: '0.35rem 0.5rem',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '6px',
    color: '#e5e7eb',
    width: '130px',
    fontFamily: 'monospace',
    letterSpacing: '0.03em',
  };

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <Calendar size={14} style={{ color: '#d4af37', flexShrink: 0 }} />
        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
          {quickPresets.map((p) => (
            <button key={p.label} className="btn btn-outline btn-sm" style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
              onClick={() => applyPreset(p)}>
              {p.label}
            </button>
          ))}
        </div>
        <button className="btn btn-outline btn-sm" style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
          onClick={() => setExpanded(!expanded)}>
          Mas filtros {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {dateFrom && (
          <span style={{ fontSize: '0.75rem', color: '#d4af37', fontWeight: '600' }}>
            {dateFrom === dateTo ? dateFrom : `${dateFrom} al ${dateTo}`}
          </span>
        )}
      </div>

      {expanded && (
        <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {['rango', 'dia', 'mes', 'anio'].map((m) => (
              <button key={m} className={`btn btn-outline btn-sm ${mode === m ? 'active' : ''}`}
                style={{ fontSize: '0.7rem' }} onClick={() => setMode(m)}>
                {m === 'rango' ? 'Rango' : m === 'dia' ? 'Dia' : m === 'mes' ? 'Mes' : 'Anio'}
              </button>
            ))}
          </div>

          {mode === 'rango' && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="text" placeholder="aaaa-mm-dd" value={dateFrom} onChange={(e) => onChange(e.target.value, dateTo)} style={dateInputStyle} />
              <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>a</span>
              <input type="text" placeholder="aaaa-mm-dd" value={dateTo} onChange={(e) => onChange(dateFrom, e.target.value)} style={dateInputStyle} />
            </div>
          )}

          {mode === 'dia' && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input type="text" placeholder="aaaa-mm-dd" value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} style={dateInputStyle} />
              <button className="btn btn-primary btn-sm" onClick={applyDay}>Aplicar</button>
            </div>
          )}

          {mode === 'mes' && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} style={{ fontSize: '0.8rem' }}>
                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} style={{ fontSize: '0.8rem' }}>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <button className="btn btn-primary btn-sm" onClick={applyMonthYear}>Aplicar</button>
            </div>
          )}

          {mode === 'anio' && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} style={{ fontSize: '0.8rem' }}>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <button className="btn btn-primary btn-sm" onClick={applyYear}>Aplicar</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            {PRESETS.map((p) => (
              <button key={p.label} className="btn btn-outline btn-sm" style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem' }}
                onClick={() => applyPreset(p)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
