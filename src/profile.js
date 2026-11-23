import { numericValue } from './csv.js';

/**
 * Inspect a parsed CSV dataset without retaining or exposing cell values.
 * Distinct counts are exact for the bounded input size (10k rows).
 */
export function profileDataset(dataset) {
  if (!dataset || !Array.isArray(dataset.columns) || !Array.isArray(dataset.rows)) {
    throw new TypeError('Load a valid parsed CSV dataset.');
  }
  const totalRows = dataset.rows.length;
  const columns = dataset.columns.map((name, index) => {
    let missing = 0, numeric = 0;
    const unique = new Set();
    for (const row of dataset.rows) {
      const raw = String(row[index] ?? '');
      const trimmed = raw.trim();
      if (!trimmed) { missing++; continue; }
      unique.add(trimmed);
      if (numericValue(trimmed) !== null) numeric++;
    }
    const nonEmpty = totalRows - missing;
    const type = nonEmpty === 0 ? 'empty' : numeric === nonEmpty ? 'numeric' :
      numeric === 0 ? 'text' : 'mixed';
    return {
      name, columnIndex: index, type,
      rows: totalRows, nonEmpty, missing,
      numeric, nonNumeric: nonEmpty - numeric,
      distinct: unique.size,
      completeness: totalRows ? nonEmpty / totalRows : 0,
    };
  });
  return {
    rows: totalRows,
    columnCount: columns.length,
    columns,
    summary: {
      missingCells: columns.reduce((total, column) => total + column.missing, 0),
      numericColumns: columns.filter(column => column.type === 'numeric').length,
      mixedColumns: columns.filter(column => column.type === 'mixed').length,
      emptyColumns: columns.filter(column => column.type === 'empty').length,
    },
    advisory: 'Statistics describe cell formats, not verified data quality or correctness.',
  };
}

/** A JSON export with column metadata only; never any source cell values. */
export function profileReport(dataset) {
  const profile = profileDataset(dataset);
  return JSON.stringify({
    format: 'csv-chart-column-profile-v1',
    ...profile,
  }, null, 2) + '\n';
}
