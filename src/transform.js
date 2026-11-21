import { numericValue } from './csv.js';

const AGGREGATES = new Set(['none', 'sum', 'average', 'count']);
const SORTS = new Set(['source', 'x-asc', 'x-desc', 'y-asc', 'y-desc']);
const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });

/**
 * Construct a chart-ready, non-mutating view of a CSV dataset.
 * Invalid/missing Y values are excluded with a count. For scatter, numeric
 * X values are also required; category aggregation is forbidden.
 *
 * Aggregation is one group per *exact* X label, preserving source order.
 * The grouping never parses formulas or evaluates CSV cell contents.
 */
export function prepareChartData(dataset, { type, xIndex, yIndex, aggregate = 'none', sort = 'source' }) {
  if (!dataset || !Array.isArray(dataset.columns) || !Array.isArray(dataset.rows)) {
    throw new TypeError('Load a CSV dataset before preparing chart data.');
  }
  if (!['bar', 'line', 'scatter'].includes(type)) throw new RangeError('Unknown chart type.');
  if (!AGGREGATES.has(aggregate)) throw new RangeError('Unknown aggregation mode.');
  if (!SORTS.has(sort)) throw new RangeError('Unknown sort order.');
  if (type === 'scatter' && aggregate !== 'none') {
    throw new RangeError('Grouping by category is not supported on scatter charts.');
  }
  if (!Number.isInteger(xIndex) || !Number.isInteger(yIndex) ||
      xIndex < 0 || xIndex >= dataset.columns.length ||
      yIndex < 0 || yIndex >= dataset.columns.length) {
    throw new RangeError('Choose valid X and Y columns.');
  }

  const valid = [];
  let discarded = 0;
  for (let index = 0; index < dataset.rows.length; index++) {
    const row = dataset.rows[index];
    const y = numericValue(row[yIndex]);
    const x = type === 'scatter' ? numericValue(row[xIndex]) : String(row[xIndex] ?? '').trim();
    if (y === null || (type === 'scatter' && x === null)) {
      discarded++;
      continue;
    }
    valid.push({ row, x, y, sourceIndex: index });
  }
  if (!valid.length) throw new Error('No usable numeric values for the selected axes.');

  let prepared;
  if (aggregate === 'none') {
    prepared = valid.map(item => ({
      x: item.x,
      y: item.y,
      sourceIndex: item.sourceIndex,
      count: 1,
    }));
  } else {
    const grouped = new Map();
    for (const item of valid) {
      if (!grouped.has(item.x)) {
        grouped.set(item.x, {
          x: item.x, sum: 0, count: 0, sourceIndex: item.sourceIndex,
        });
      }
      const group = grouped.get(item.x);
      group.sum += item.y;
      group.count++;
      if (!Number.isFinite(group.sum)) throw new RangeError('Aggregated sum exceeds the numeric range.');
    }
    prepared = Array.from(grouped.values(), group => ({
      x: group.x,
      y: aggregate === 'sum' ? group.sum : aggregate === 'average' ? group.sum / group.count : group.count,
      sourceIndex: group.sourceIndex,
      count: group.count,
    }));
  }
  if (sort !== 'source') {
    const descending = sort.endsWith('desc');
    const field = sort.startsWith('x') ? 'x' : 'y';
    const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
    prepared.sort((a, b) => {
      const first = a[field], second = b[field];
      const comparison = typeof first === 'number' && typeof second === 'number'
        ? Math.sign(first - second)
        : collator.compare(String(first), String(second));
      return (descending ? -comparison : comparison) || a.sourceIndex - b.sourceIndex;
    });
  }

  const values = prepared.map(entry => entry.y);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total)) throw new RangeError('The total is outside the supported numeric range.');
  const dataRows = prepared.map(entry => {
    const row = Array(dataset.columns.length).fill('');
    row[xIndex] = String(entry.x);
    row[yIndex] = String(entry.y);
    return row;
  });
  // Reuse existing SVG chart renderer by preserving the selected column indexes.
  const columns = [...dataset.columns];
  if (aggregate !== 'none') {
    columns[yIndex] = ({
      sum: 'Sum of ', average: 'Average of ', count: 'Count of ',
    })[aggregate] + columns[yIndex];
  }
  return {
    dataset: { columns, rows: dataRows },
    prepared,
    discarded,
    sourceCount: dataset.rows.length,
    grouped: aggregate !== 'none',
    aggregate,
    sort,
    statistics: {
      count: values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      total,
      mean: total / values.length,
    },
  };
}

/** Escape all cells, including formula-looking strings, for safe spreadsheet export. */
function csvCell(value, spreadsheetLabel = true) {
  let text = String(value ?? '');
  // CSV injection: quote-prefix cells beginning with formulas, allowing
  // spreadsheet viewers to treat them as literals instead of executable text.
  if (spreadsheetLabel && /^[\s]*[=+\-@\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

/**
 * Export exactly the chart-ready data, not unrelated columns or original rows.
 * The Y values are numbers computed by the normalization/aggregation stage.
 * X labels are treated as data, not executable spreadsheet formulas.
 */
export function chartDataCsv(prepared, { xLabel = 'X', yLabel = 'Y' } = {}) {
  if (!prepared || !Array.isArray(prepared.prepared)) throw new TypeError('Expected prepared chart data.');
  const output = [[csvCell(xLabel), csvCell(yLabel), csvCell('Source row count')].join(',')];
  for (const item of prepared.prepared) {
    output.push([csvCell(item.x), csvCell(item.y, false), csvCell(item.count, false)].join(','));
  }
  return '\uFEFF' + output.join('\r\n') + '\r\n';
}

export function statisticsText(stats) {
  return 'Min ' + numberFormat.format(stats.min) +
    ' · Max ' + numberFormat.format(stats.max) +
    ' · Mean ' + numberFormat.format(stats.mean);
}
