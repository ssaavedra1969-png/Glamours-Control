import { useState, useMemo } from 'react';

export function useSortableData(items, defaultKey = 'fecha', defaultDirection = 'desc') {
  const [sortConfig, setSortConfig] = useState({ key: defaultKey, direction: defaultDirection });

  const sorted = useMemo(() => {
    if (!items || items.length === 0) return [];
    const copy = [...items];
    copy.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      if (aVal == null) aVal = '';
      if (bVal == null) bVal = '';
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return copy;
  }, [items, sortConfig]);

  const requestSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  return { sorted, requestSort, sortConfig };
}

export function SortIcon({ config, column }) {
  if (config.key !== column) return <span style={{ opacity: 0.2, marginLeft: '4px' }}>&#x25B2;&#x25BC;</span>;
  return <span style={{ marginLeft: '4px', color: '#d4af37' }}>{config.direction === 'asc' ? '\u25B2' : '\u25BC'}</span>;
}
