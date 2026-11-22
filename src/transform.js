import { numericValue } from './csv.js';
import { plottedScatterCorrelation } from './correlation.js';

const AGGREGATES = new Set(['none', 'sum', 'average', 'count', 'minimum', 'maximum']);
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
  // Exclusive rejection categories: Y takes precedence over X, since a row
  // with an unusable Y would be excluded even for a bar/line chart.
  // This is a diagnostic of parsing, never a claim about source data quality.
  const excludedReasons = {
    missingY: 0, nonNumericY: 0, missingX: 0, nonNumericX: 0,
  };
  let discarded = 0;
  for (let index = 0; index < dataset.rows.length; index++) {
    const row = dataset.rows[index];
    const rawY = String(row[yIndex] ?? '').trim();
    const y = numericValue(row[yIndex]);
    if (y === null) {
      excludedReasons[rawY === '' ? 'missingY' : 'nonNumericY']++;
      discarded++;
      continue;
    }
    const rawX = String(row[xIndex] ?? '').trim();
    const x = type === 'scatter' ? numericValue(row[xIndex]) : rawX;
    if (type === 'scatter' && x === null) {
      excludedReasons[rawX === '' ? 'missingX' : 'nonNumericX']++;
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
          x: item.x, sum: 0, count: 0, minimum: item.y, maximum: item.y,
          sourceIndex: item.sourceIndex,
        });
      }
      const group = grouped.get(item.x);
      group.count++;
      group.minimum = Math.min(group.minimum, item.y);
      group.maximum = Math.max(group.maximum, item.y);
      // Count/min/max do not need a sum. Avoid rejecting those otherwise
      // valid aggregations when large numeric Y values would overflow it.
      if (aggregate === 'sum' || aggregate === 'average') {
        group.sum += item.y;
        if (!Number.isFinite(group.sum)) throw new RangeError('Aggregated sum exceeds the numeric range.');
      }
    }
    prepared = Array.from(grouped.values(), group => ({
      x: group.x,
      y: aggregate === 'sum' ? group.sum : aggregate === 'average' ? group.sum / group.count :
        aggregate === 'minimum' ? group.minimum : aggregate === 'maximum' ? group.maximum : group.count,
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
  // Quantiles apply to the displayed prepared series: individual Y values
  // when ungrouped, per-category aggregates when grouping is selected.
  const ordered = [...values].sort((left, right) => left - right);
  const percentile = fraction => {
    const offset = (ordered.length - 1) * fraction;
    const index = Math.floor(offset);
    const next = Math.min(index + 1, ordered.length - 1);
    const weight = offset - index;
    return ordered[index] * (1 - weight) + ordered[next] * weight;
  };
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total)) throw new RangeError('The total is outside the supported numeric range.');
  // Use a compact two-column chart view to avoid copying unrelated fields.
  // Separate columns also preserve data when the same source field is X and Y.
  const dataRows = prepared.map(entry => [String(entry.x), String(entry.y)]);
  const columns = [
    dataset.columns[xIndex],
    aggregate === 'none' ? dataset.columns[yIndex] : ({
      sum: 'Sum of ', average: 'Average of ', count: 'Count of ',
      minimum: 'Minimum of ', maximum: 'Maximum of ',
    })[aggregate] + dataset.columns[yIndex],
  ];
  return {
    dataset: { columns, rows: dataRows },
    prepared,
    discarded,
    excludedReasons,
    sourceCount: dataset.rows.length,
    grouped: aggregate !== 'none',
    type,
    aggregate,
    sort,
    statistics: {
      count: values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      total,
      mean: total / values.length,
      median: percentile(0.5),
      p90: percentile(0.9),
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

/**
 * Export the exact leading prepared series that was plotted by createChart().
 * Chart rendering selects up to its type-specific cap from prepared rows
 * after aggregation/sorting, without reshuffling or skipping valid points.
 * Unlike chartDataCsv(), this intentionally excludes non-plotted prepared
 * points. The UI must provide the plotted count from the current render.
 */
export function plottedChartCsv(prepared, { plotted, xLabel = 'X', yLabel = 'Y' } = {}) {
  if (!prepared || !Array.isArray(prepared.prepared) ||
      prepared.prepared.length < 1 || prepared.prepared.length > 10_000 ||
      !Number.isSafeInteger(plotted) || plotted < 1 ||
      plotted > Math.min(prepared.prepared.length, 1000)) {
    throw new TypeError('Expected the plotted count of a complete chart preview.');
  }
  return chartDataCsv({ prepared: prepared.prepared.slice(0, plotted) }, { xLabel, yLabel });
}

export function statisticsText(stats) {
  return 'Min ' + numberFormat.format(stats.min) +
    ' · Median ' + numberFormat.format(stats.median) +
    ' · Mean ' + numberFormat.format(stats.mean) +
    ' · P90 ' + numberFormat.format(stats.p90) +
    ' · Max ' + numberFormat.format(stats.max);
}


/**
 * Privacy-reduced export of statistics for the prepared chart series.
 * No source rows, X values, column names, text labels or chart title.
 * Metrics can themselves be sensitive and must be reviewed before sharing.
 */
export function chartStatisticsJson(prepared, { plotted } = {}) {
  if (!prepared || typeof prepared !== 'object' || !Array.isArray(prepared.prepared) ||
      !prepared.statistics || !Number.isSafeInteger(prepared.sourceCount) ||
      prepared.sourceCount < 1 || !Number.isSafeInteger(prepared.discarded) ||
      prepared.discarded < 0 || prepared.discarded >= prepared.sourceCount ||
      !AGGREGATES.has(prepared.aggregate) || !SORTS.has(prepared.sort) ||
      !['bar', 'line', 'scatter'].includes(prepared.type) ||
      typeof prepared.grouped !== 'boolean' ||
      prepared.grouped !== (prepared.aggregate !== 'none')) {
    throw new TypeError('Expected valid prepared chart data.');
  }
  const reasons = prepared.excludedReasons;
  const keys = ['missingY', 'nonNumericY', 'missingX', 'nonNumericX'];
  if (!reasons || typeof reasons !== 'object' ||
      !keys.every(key => Number.isSafeInteger(reasons[key]) &&
        reasons[key] >= 0 && reasons[key] <= prepared.sourceCount) ||
      keys.reduce((total, key) => total + reasons[key], 0) !== prepared.discarded) {
    throw new TypeError('Excluded-row reason counts do not reconcile.');
  }
  const stats = prepared.statistics;
  const preparedPoints = prepared.prepared.length;
  if (preparedPoints < 1 || preparedPoints > prepared.sourceCount ||
      !Number.isSafeInteger(plotted) || plotted < 1 || plotted > preparedPoints ||
      stats.count !== preparedPoints ||
      !['min', 'max', 'total', 'mean', 'median', 'p90'].every(key =>
        typeof stats[key] === 'number' && Number.isFinite(stats[key]))) {
    throw new TypeError('Chart statistics are incomplete or outside numeric limits.');
  }
  return JSON.stringify({
    format: 'csv-chart-series-statistics-v1',
    sourceRows: prepared.sourceCount,
    excludedRows: prepared.discarded,
    excludedReasons: {
      missingY: reasons.missingY,
      nonNumericY: reasons.nonNumericY,
      missingX: reasons.missingX,
      nonNumericX: reasons.nonNumericX,
    },
    preparedPoints,
    plottedPoints: plotted,
    omittedFromChart: preparedPoints - plotted,
    aggregation: prepared.aggregate,
    sort: prepared.sort,
    statistics: {
      min: stats.min, median: stats.median, mean: stats.mean,
      p90: stats.p90, max: stats.max, total: stats.total,
    },
    ...(prepared.type === 'scatter'
      ? { plottedScatterCorrelation: plottedScatterCorrelation(prepared, plotted) }
      : {}),
    advisory: 'Y statistics describe the full prepared series and grouping changes their meaning. For scatter only, Pearson r describes solely the first plotted points (max 1,000); correlation is not causation or statistical significance. Exclusion reasons are exclusive. Aggregate values may be sensitive.',
  }, null, 2) + '\n';
}
