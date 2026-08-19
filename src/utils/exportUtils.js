import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { formatCurrency } from './formatCurrency';
import { formatDate } from './dateUtils';

export function exportToCSV(data, filename) {
  if (!data || data.length === 0) return;
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map((row) =>
      headers.map((h) => {
        const val = row[h];
        if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
        return val;
      }).join(',')
    ),
  ].join('\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, `${filename}.csv`);
}

export function exportToExcel(data, filename) {
  if (!data || data.length === 0) return;
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Datos');
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
  saveAs(blob, `${filename}.xlsx`);
}

export function exportToPDF(data, columns, title, filename) {
  const doc = new jsPDF('l', 'mm', 'a4');

  doc.setFontSize(18);
  doc.setTextColor(109, 40, 217);
  doc.text('GLAMOUR\'S', 14, 15);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(title, 14, 22);
  doc.text(`Fecha: ${formatDate(new Date())}`, 14, 28);

  const headers = columns.map((c) => c.header);
  const bodyData = data.map((row) =>
    columns.map((c) => {
      const val = row[c.key];
      if (c.format === 'currency') return formatCurrency(val);
      if (c.format === 'date') return formatDate(val);
      return String(val ?? '');
    })
  );

  doc.autoTable({
    head: [headers],
    body: bodyData,
    startY: 32,
    theme: 'grid',
    headStyles: { fillColor: [109, 40, 217], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 7 },
    alternateRowStyles: { fillColor: [245, 243, 255] },
    margin: { top: 32 },
  });

  doc.save(`${filename}.pdf`);
}
