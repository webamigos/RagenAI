function escapeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvString(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) {
    return '';
  }
  const headers = Object.keys(rows[0]);
  const headerRow = headers.join(',');
  const dataRows = rows.map((row) =>
    headers.map((h) => escapeValue(row[h])).join(','),
  );
  return [headerRow, ...dataRows].join('\n');
}

export function exportToCsv(
  rows: Record<string, unknown>[],
  filename: string,
): void {
  const csv = buildCsvString(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
