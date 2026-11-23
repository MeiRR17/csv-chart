import { profileDataset } from './profile.js';

/**
 * Counts-only column-quality CSV for local spreadsheet review.
 * Source cell values are never exported; column headers can still be private.
 */
function csvCell(value) {
  let text = String(value ?? '');
  // Prevent formula-like column names from executing when opened in a sheet.
  if (/^[\s]*[=+\-@\t\r\n]/u.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function profileCsv(dataset) {
  const profile = profileDataset(dataset);
  const columns = [
    'column', 'inferred_type', 'rows', 'non_empty', 'missing',
    'numeric', 'non_numeric', 'distinct', 'completeness_percent',
  ];
  const rows = [columns.map(csvCell).join(',')];
  for (const item of profile.columns) {
    rows.push([
      item.name, item.type, item.rows, item.nonEmpty, item.missing,
      item.numeric, item.nonNumeric, item.distinct,
      (item.completeness * 100).toFixed(1),
    ].map(csvCell).join(','));
  }
  return '\uFEFF' + rows.join('\r\n') + '\r\n';
}
