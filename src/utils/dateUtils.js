import { format, parseISO, subDays } from 'date-fns';
import { es } from 'date-fns/locale';

export function defaultDateFrom() {
  return format(subDays(new Date(), 29), 'yyyy-MM-dd');
}

export function defaultDateTo() {
  return format(new Date(), 'yyyy-MM-dd');
}

export function formatDate(date, fmt = 'dd/MM/yyyy') {
  if (!date) return '--';
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, fmt, { locale: es });
}

export function formatDateTime(date) {
  if (!date) return '--';
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'dd/MM/yyyy HH:mm', { locale: es });
}

export function formatTime(date) {
  if (!date) return '--:--';
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'HH:mm', { locale: es });
}

export function today() {
  return format(new Date(), 'yyyy-MM-dd');
}

export function getDatesInRange(start, end) {
  const dates = [];
  let current = parseISO(start);
  const endDate = parseISO(end);
  while (current <= endDate) {
    dates.push(format(current, 'yyyy-MM-dd'));
    current = subDays(current, -1);
  }
  return dates;
}

export function last7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = subDays(new Date(), 6 - i);
    return { date: format(d, 'yyyy-MM-dd'), label: format(d, 'dd/MM') };
  });
}

export function last30Days() {
  return Array.from({ length: 30 }, (_, i) => {
    const d = subDays(new Date(), 29 - i);
    return format(d, 'yyyy-MM-dd');
  });
}

export function parseExcelDate(filename) {
  const match = filename.match(/^(\d{6})_(?:Caja|Ventas)/i);
  if (match) {
    const str = match[1];
    return `20${str.slice(0, 2)}-${str.slice(2, 4)}-${str.slice(4, 6)}`;
  }
  return today();
}

export function filterByDateRange(items, start, end, field = 'fecha') {
  if (!start && !end) return items;
  return items.filter((item) => {
    const d = item[field];
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  });
}
