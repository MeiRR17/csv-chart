import { numericValue } from './csv.js';

const WIDTH = 960;
const HEIGHT = 500;
const PAD = { left: 82, right: 32, top: 44, bottom: 86 };
const GRAPH_W = WIDTH - PAD.left - PAD.right;
const GRAPH_H = HEIGHT - PAD.top - PAD.bottom;

function xml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]);
}
const formatNumber = value => Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });

function bounds(values, includeZero) {
  let low = Math.min(...values), high = Math.max(...values);
  if (includeZero) { low = Math.min(0, low); high = Math.max(0, high); }
  if (low === high) { low -= Math.max(1, Math.abs(low) * 0.1); high += Math.max(1, Math.abs(high) * 0.1); }
  else if (!includeZero) { const gap = (high - low) * 0.09; low -= gap; high += gap; }
  // Finite input values can still produce an infinite span or bounds during
  // padding (for example values near Number.MAX_VALUE). Fail explicitly
  // rather than exporting an SVG containing NaN/Infinity coordinates.
  if (!Number.isFinite(low) || !Number.isFinite(high) ||
      !Number.isFinite(high - low) || high <= low) {
    throw new RangeError('Chart values span an unsupported numeric range. Narrow the data values.');
  }
  return [low, high];
}
// Normalize before multiplying by the viewport. The former expression
// (value - low) * total / span can overflow to Infinity for a finite number
// such as 1e308, even when both axis bounds and their span are finite.
function coordinate(value, low, high, total) {
  const ratio = (value - low) / (high - low);
  const mapped = ratio * total;
  if (!Number.isFinite(mapped)) {
    throw new RangeError('Unable to map chart values to finite SVG coordinates.');
  }
  return mapped;
}
function textNode(x, y, value, cls = '', anchor = 'middle') {
  return '<text x="' + x + '" y="' + y + '" text-anchor="' + anchor + '" class="' + cls + '">' + xml(value) + '</text>';
}
function axisGrid(yLow, yHigh) {
  let nodes = '';
  for (let i = 0; i <= 5; i++) {
    // Multiply by a bounded [0,1] fraction, not by i (up to 5) first.
    // The old multiplication could overflow before the final division.
    const value = yLow + (yHigh - yLow) * (i / 5);
    const y = PAD.top + GRAPH_H * (1 - i / 5);
    nodes += '<line x1="' + PAD.left + '" y1="' + y.toFixed(2) + '" x2="' + (WIDTH - PAD.right) + '" y2="' + y.toFixed(2) + '" class="gridline"/>';
    nodes += textNode(PAD.left - 13, y + 5, formatNumber(value), 'tick', 'end');
  }
  return nodes;
}

/**
 * Generate an accessible, self-contained SVG without HTML injection.
 * Bar and line use categorical X labels; scatter requires numeric X and Y.
 */
export function createChart(dataset, options) {
  const { columns, rows } = dataset;
  const { type, xIndex, yIndex, title = '' } = options;
  if (!['bar', 'line', 'scatter'].includes(type)) throw new Error('Choose a supported chart type.');
  if (!Number.isInteger(xIndex) || !Number.isInteger(yIndex)
      || xIndex < 0 || yIndex < 0 || xIndex >= columns.length || yIndex >= columns.length) {
    throw new Error('Select valid X and Y columns.');
  }
  const limit = type === 'bar' ? 50 : type === 'line' ? 250 : 1000;
  const data = [];
  let skipped = 0;
  for (const row of rows) {
    const y = numericValue(row[yIndex]);
    const x = type === 'scatter' ? numericValue(row[xIndex]) : row[xIndex].trim();
    if (y === null || (type === 'scatter' && x === null)) { skipped++; continue; }
    if (data.length < limit) data.push({ x, y });
  }
  if (!data.length) throw new Error('No numeric values to chart. Select a different Y column or review the CSV.');

  const yValues = data.map(entry => entry.y);
  const [yLow, yHigh] = bounds(yValues, type === 'bar');
  const toY = n => PAD.top + GRAPH_H * (1 - coordinate(n, yLow, yHigh, 1));
  const parts = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + WIDTH + ' ' + HEIGHT + '" role="img" aria-label="' +
    xml((title || type + ' chart') + ': ' + columns[yIndex] + ' by ' + columns[xIndex]) + '">',
    '<style>svg{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#fff;border-radius:16px}' +
    '.heading{font-size:19px;font-weight:750;fill:#14243a}.axis{font-size:14px;fill:#54657a}.tick{font-size:12px;fill:#53657c}' +
    '.gridline{stroke:#e2e9f2;stroke-width:1}.bar{fill:#2563eb}.bar:hover{fill:#1645a8}' +
    '.trend{fill:none;stroke:#2563eb;stroke-width:3;stroke-linejoin:round;stroke-linecap:round}' +
    '.dot{fill:#10b981;stroke:#fff;stroke-width:1.5}</style>',
    textNode(WIDTH / 2, 28, title || 'CSV Chart', 'heading'),
    axisGrid(yLow, yHigh),
    '<line x1="' + PAD.left + '" y1="' + (PAD.top + GRAPH_H) + '" x2="' + (WIDTH - PAD.right) + '" y2="' + (PAD.top + GRAPH_H) + '" stroke="#9eafc4"/>',
    textNode(WIDTH / 2, HEIGHT - 14, columns[xIndex], 'axis'),
    '<g transform="translate(22 ' + (PAD.top + GRAPH_H / 2) + ') rotate(-90)">' +
      textNode(0, 0, columns[yIndex], 'axis') + '</g>',
  ];

  if (type === 'scatter') {
    let [xLow, xHigh] = bounds(data.map(item => item.x), false);
    const toX = n => PAD.left + coordinate(n, xLow, xHigh, GRAPH_W);
    for (let i = 0; i <= 5; i++) {
      const n = xLow + (xHigh - xLow) * i / 5;
      const x = toX(n);
      parts.push(textNode(x.toFixed(2), PAD.top + GRAPH_H + 22, formatNumber(n), 'tick'));
    }
    for (const entry of data) {
      parts.push('<circle class="dot" cx="' + toX(entry.x).toFixed(2) + '" cy="' + toY(entry.y).toFixed(2) +
        '" r="5"><title>' + xml(formatNumber(entry.x) + ', ' + formatNumber(entry.y)) + '</title></circle>');
    }
  } else {
    const width = GRAPH_W / data.length;
    const barWidth = Math.min(48, Math.max(1, width * 0.76));
    const labelStep = Math.max(1, Math.ceil(data.length / 9));
    const zeroY = toY(0);
    let path = '';
    for (let index = 0; index < data.length; index++) {
      const item = data[index];
      const x = PAD.left + width * (index + 0.5);
      const y = toY(item.y);
      if (type === 'bar') {
        parts.push('<rect class="bar" x="' + (x - barWidth / 2).toFixed(2) + '" y="' + Math.min(y, zeroY).toFixed(2) +
          '" width="' + barWidth.toFixed(2) + '" height="' + Math.max(1, Math.abs(zeroY - y)).toFixed(2) + '" rx="3"><title>' +
          xml((item.x || '(empty)') + ': ' + formatNumber(item.y)) + '</title></rect>');
      } else {
        path += (index ? ' L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2);
      }
      if (index % labelStep === 0 || index === data.length - 1) {
        const label = String(item.x || '(empty)');
        const shortLabel = label.length > 17 ? label.slice(0, 16) + '…' : label;
        parts.push(textNode(x.toFixed(2), PAD.top + GRAPH_H + 23, shortLabel, 'tick'));
      }
    }
    if (type === 'line') {
      parts.push('<path class="trend" d="' + path + '"/>');
      for (let index = 0; index < data.length; index++) {
        const item = data[index];
        const x = PAD.left + width * (index + 0.5);
        parts.push('<circle cx="' + x.toFixed(2) + '" cy="' + toY(item.y).toFixed(2) +
          '" r="3.5" fill="#2563eb"><title>' + xml(item.x + ': ' + formatNumber(item.y)) + '</title></circle>');
      }
    }
  }
  parts.push('</svg>');
  return {
    svg: parts.join(''),
    plotted: data.length,
    skipped,
    capped: Math.max(0, rows.length - skipped - data.length),
  };
}
