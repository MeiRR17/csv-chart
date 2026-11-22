import { parseCsv, columnProfile } from './src/csv.js';
import { createChart } from './src/charts.js';
import { prepareChartData, chartDataCsv, plottedChartCsv, statisticsText, chartStatisticsJson } from './src/transform.js';
import { profileDataset, profileReport } from './src/profile.js';
import { profileCsv } from './src/profile-csv.js';

const get = id => document.getElementById(id);
const source = get('source');
const file = get('file');
const dropzone = get('dropzone');
const delimiter = get('delimiter');
const xColumn = get('x-column');
const yColumn = get('y-column');
const chartStage = get('chart');
const exportButton = get('export');
const pngButton = get('export-png');
const dataButton = get('export-data');
const plottedButton = get('export-plotted-data');
const statsButton = get('export-statistics');
const aggregationControl = get('aggregation');
const sortControl = get('sort');
const renderButton = get('render');
const message = get('data-message');
const sample = [
  'Month,Revenue,Orders,New customers',
  'Jan,12500,280,83',
  'Feb,15800,330,105',
  'Mar,14200,300,96',
  'Apr,18900,395,124',
  'May,21600,442,156',
  'Jun,25200,510,178',
  'Jul,24100,488,171',
  'Aug,27800,557,202',
  'Sep,31200,612,238',
  'Oct,29700,591,224',
  'Nov,33800,660,255',
  'Dec,38200,728,301',
].join('\n');
let dataset = null;
let lastSvg = '';
let lastPrepared = null;
let lastPlotted = null;
let dataRevision = 0;
let chartRevision = 0;

function status(text, type = '') {
  message.textContent = text;
  message.className = 'notice' + (type ? ' ' + type : '');
}
function clearChart() {
  chartRevision++;
  lastSvg = '';
  lastPrepared = null;
  lastPlotted = null;
  exportButton.disabled = pngButton.disabled = dataButton.disabled = plottedButton.disabled = statsButton.disabled = true;
  get('chart-statistics').textContent = 'Load or update chart data to view statistics.';
  chartStage.replaceChildren();
  const empty = document.createElement('div');
  empty.className = 'empty';
  const heading = document.createElement('h3');
  heading.textContent = 'Your chart will appear here';
  const info = document.createElement('p');
  info.textContent = 'Load a CSV and select your axes to visualize it.';
  empty.append(heading, info);
  chartStage.append(empty);
  get('plotted').textContent = '—';
}
function resetData() {
  dataset = null;
  get('export-profile').disabled = get('export-profile-csv').disabled = true;
  get('profile-table').querySelector('tbody').replaceChildren();
  get('profile-summary').textContent = 'Read a CSV to inspect column completeness and numeric consistency.';
  xColumn.disabled = yColumn.disabled = renderButton.disabled = true;
  aggregationControl.disabled = sortControl.disabled = true;
  exportButton.disabled = pngButton.disabled = dataButton.disabled = true;
  get('rows').textContent = get('columns').textContent = '—';
  get('table-count').textContent = 'No data loaded';
  get('preview-table').querySelector('thead').replaceChildren();
  get('preview-table').querySelector('tbody').replaceChildren();
  clearChart();
}
function addOption(select, label, value) {
  const option = document.createElement('option');
  option.value = String(value);
  option.textContent = label;
  select.append(option);
}
function populateColumns() {
  xColumn.replaceChildren();
  yColumn.replaceChildren();
  let suggestedY = -1;
  let fallbackY = -1;
  dataset.columns.forEach((name, index) => {
    const profile = columnProfile(dataset.rows, index);
    addOption(xColumn, name, index);
    addOption(yColumn, name + (profile.numeric ? ' · ' + profile.numeric + ' numeric' : ''), index);
    if (fallbackY === -1 && profile.numeric) fallbackY = index;
    if (suggestedY === -1 && profile.numeric && profile.fraction >= 0.75) suggestedY = index;
  });
  yColumn.value = String(suggestedY >= 0 ? suggestedY : fallbackY >= 0 ? fallbackY : 0);
  xColumn.value = String(dataset.columns.length > 1 && yColumn.value === '0' ? 1 : 0);
  xColumn.disabled = yColumn.disabled = sortControl.disabled = false;
  aggregationControl.disabled = selectedType() === 'scatter';
}
function previewTable() {
  const table = get('preview-table');
  const head = table.querySelector('thead');
  const body = table.querySelector('tbody');
  head.replaceChildren();
  body.replaceChildren();
  const headerRow = document.createElement('tr');
  for (const name of dataset.columns.slice(0, 12)) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = name;
    headerRow.append(th);
  }
  head.append(headerRow);
  for (const row of dataset.rows.slice(0, 8)) {
    const tr = document.createElement('tr');
    for (const value of row.slice(0, 12)) {
      const td = document.createElement('td');
      td.textContent = value;
      td.title = value.slice(0, 1000);
      tr.append(td);
    }
    body.append(tr);
  }
  get('table-count').textContent = 'Showing ' + Math.min(8, dataset.rows.length) + ' of ' +
    dataset.rows.length.toLocaleString() + ' rows' +
    (dataset.columns.length > 12 ? ' · first 12 columns' : '');
}
function renderColumnProfile() {
  const profile = profileDataset(dataset);
  const body = get('profile-table').querySelector('tbody');
  body.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const column of profile.columns) {
    const tr = document.createElement('tr');
    if (column.type === 'mixed' || column.type === 'empty') tr.className = 'profile-warning';
    for (const value of [
      column.name, column.type,
      column.missing.toLocaleString() + ' / ' + column.rows.toLocaleString(),
      column.numeric.toLocaleString() + ' / ' + column.nonEmpty.toLocaleString(),
      column.distinct.toLocaleString(),
    ]) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }
    fragment.append(tr);
  }
  body.append(fragment);
  get('profile-summary').textContent =
    profile.summary.missingCells.toLocaleString() + ' missing cells · ' +
    profile.summary.numericColumns.toLocaleString() + ' numeric columns · ' +
    profile.summary.mixedColumns.toLocaleString() + ' mixed-format columns' +
    (profile.summary.emptyColumns ? ' · ' +
      profile.summary.emptyColumns.toLocaleString() + ' entirely empty columns' : '');
  get('export-profile').disabled = get('export-profile-csv').disabled = false;
}
function selectedType() {
  return document.querySelector('input[name="type"]:checked').value;
}
function renderChart() {
  if (!dataset) return;
  try {
    const type = selectedType();
    aggregationControl.disabled = type === 'scatter';
    const aggregate = type === 'scatter' ? 'none' : aggregationControl.value;
    const prepared = prepareChartData(dataset, {
      type,
      xIndex: Number(xColumn.value),
      yIndex: Number(yColumn.value),
      aggregate,
      sort: sortControl.value,
    });
    const result = createChart(prepared.dataset, {
      type,
      xIndex: 0,
      yIndex: 1,
      title: get('chart-title').value.trim(),
    });
    // The chart renderer escapes CSV values before building SVG markup.
    chartStage.innerHTML = result.svg;
    chartRevision++;
    lastSvg = result.svg;
    lastPrepared = prepared;
    lastPlotted = result.plotted;
    exportButton.disabled = pngButton.disabled = dataButton.disabled = plottedButton.disabled = statsButton.disabled = false;
    get('plotted').textContent = result.plotted.toLocaleString();
    get('chart-statistics').textContent =
      (prepared.grouped ? 'Grouped categories: ' : 'Valid rows: ') +
      prepared.statistics.count.toLocaleString() + ' · ' +
      statisticsText(prepared.statistics) +
      (prepared.discarded ? ' · Excluded ' + prepared.discarded.toLocaleString() + ' invalid rows' : '');
    const parts = ['Chart created from ' + result.plotted.toLocaleString() + ' data points.'];
    if (prepared.grouped) parts.push('Grouped numeric Y values using ' + aggregate + '.');
    if (prepared.discarded) parts.push(prepared.discarded.toLocaleString() + ' rows skipped (non-numeric or missing values).');
    if (result.capped) parts.push(result.capped.toLocaleString() + ' prepared points omitted to keep the chart readable.');
    status(parts.join(' '), 'success');
  } catch (error) {
    clearChart();
    status(error.message, 'error');
  }
}
function loadData() {
  dataRevision++;
  try {
    const chosenDelimiter = delimiter.value === 'tab' ? '\t' : delimiter.value;
    dataset = parseCsv(source.value, chosenDelimiter);
    populateColumns();
    previewTable();
    renderColumnProfile();
    renderButton.disabled = false;
    get('rows').textContent = dataset.rows.length.toLocaleString();
    get('columns').textContent = dataset.columns.length.toLocaleString();
    const firstNumeric = dataset.columns.some((_, index) => columnProfile(dataset.rows, index).numeric);
    if (!firstNumeric) {
      clearChart();
      status('CSV loaded. It does not contain numeric values for the Y axis.', 'error');
    } else renderChart();
  } catch (error) {
    resetData();
    status(error.message, 'error');
  }
}
async function loadFile(upload) {
  if (!upload) return;
  const revision = ++dataRevision;
  resetData();
  if (upload.size > 2_000_000) {
    status('File exceeds the 2 MB limit.', 'error');
    return;
  }
  try {
    // Blob.text() replaces malformed UTF-8 bytes with U+FFFD, silently
    // changing labels and values. Decode strictly so imported data is exact.
    const bytes = await upload.arrayBuffer();
    if (revision !== dataRevision) return;
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      status('CSV files must be valid UTF-8. Convert the file to UTF-8 and try again.', 'error');
      return;
    }
    if (revision !== dataRevision) return; // Do not override later edits/files.
    source.value = text;
    loadData();
  } catch {
    if (revision !== dataRevision) return;
    resetData();
    status('This file could not be read.', 'error');
  }
}

get('parse').addEventListener('click', loadData);
get('render').addEventListener('click', renderChart);
get('sample').addEventListener('click', () => {
  source.value = sample;
  get('chart-title').value = 'Annual sales overview';
  delimiter.value = 'auto';
  loadData();
});
source.addEventListener('input', () => {
  dataRevision++;
  if (dataset) {
    resetData();
    status('CSV changed. Click “Read data” to use the new values.');
  }
});
delimiter.addEventListener('change', () => {
  dataRevision++;
  if (dataset) {
    resetData();
    status('Separator changed. Click “Read data” to parse the values again.');
  }
});
[xColumn, yColumn, get('chart-title'), aggregationControl, sortControl].forEach(element => element.addEventListener('change', renderChart));
// Text entry fires 'input' long before 'change' (which often waits for blur).
// Invalidate downloadable SVG/PNG/CSV immediately so none can misrepresent
// an edited title. The existing 'change' handler renders the finished title.
get('chart-title').addEventListener('input', () => {
  if (!dataset) return;
  clearChart();
  status('Chart title changed. Finish editing or choose Render chart to update the preview.');
});
document.querySelectorAll('input[name="type"]').forEach(input => input.addEventListener('change', () => {
  if (!dataset) return;
  aggregationControl.disabled = selectedType() === 'scatter';
  if (selectedType() === 'scatter' && columnProfile(dataset.rows, Number(xColumn.value)).numeric === 0) {
    const numeric = dataset.columns.findIndex((_, index) => columnProfile(dataset.rows, index).numeric > 0);
    if (numeric >= 0) xColumn.value = String(numeric);
  }
  renderChart();
}));
file.addEventListener('change', () => {
  const selected = file.files?.[0];
  file.value = ''; // Allow importing the same file again after edits.
  void loadFile(selected);
});
dropzone.addEventListener('click', () => file.click());
dropzone.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); file.click(); }
});
dropzone.addEventListener('dragover', event => {
  event.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', event => {
  event.preventDefault();
  dropzone.classList.remove('dragover');
  loadFile(event.dataTransfer.files[0]);
});
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

get('export-profile').addEventListener('click', () => {
  if (!dataset) return;
  const report = profileReport(dataset);
  download(new Blob([report], { type: 'application/json;charset=utf-8' }), 'csv-column-profile.json');
  status('Column profile exported locally. The report includes column names but no source cell values.', 'success');
});
get('export-profile-csv').addEventListener('click', () => {
  if (!dataset) return;
  const report = profileCsv(dataset);
  download(new Blob([report], { type: 'text/csv;charset=utf-8' }), 'csv-column-profile.csv');
  status('Column profile CSV exported. It includes column names and counts, not cell values.', 'success');
});

exportButton.addEventListener('click', () => {
  if (!lastSvg) return;
  download(new Blob([lastSvg], { type: 'image/svg+xml;charset=utf-8' }), 'csv-chart.svg');
});

statsButton.addEventListener('click', () => {
  if (!lastPrepared || lastPlotted === null || !dataset) return;
  try {
    const report = chartStatisticsJson(lastPrepared, { plotted: lastPlotted });
    download(new Blob([report], { type: 'application/json;charset=utf-8' }),
      'chart-statistics.json');
    status('Prepared-series statistics exported without source rows or labels. Numerical aggregates may still be sensitive.', 'success');
  } catch (error) {
    status('Could not export statistics: ' + error.message, 'error');
  }
});

plottedButton.addEventListener('click', () => {
  if (!lastPrepared || !dataset || lastPlotted === null) return;
  try {
    const csv = plottedChartCsv(lastPrepared, {
      plotted: lastPlotted,
      xLabel: dataset.columns[Number(xColumn.value)],
      yLabel: lastPrepared.dataset.columns[1],
    });
    download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'plotted-chart-data.csv');
    status('Only the ' + lastPlotted + ' points drawn on the current chart were exported. The full Chart CSV may contain more prepared rows.', 'success');
  } catch (error) {
    status('Plotted data export failed: ' + error.message, 'error');
  }
});

dataButton.addEventListener('click', () => {
  if (!lastPrepared || !dataset) return;
  const csv = chartDataCsv(lastPrepared, {
    xLabel: dataset.columns[Number(xColumn.value)],
    yLabel: lastPrepared.dataset.columns[1],
  });
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'chart-data.csv');
});

pngButton.addEventListener('click', () => {
  if (!lastSvg) return;
  const sourceSvg = lastSvg;
  const capturedRevision = chartRevision;
  const svgUrl = URL.createObjectURL(new Blob([sourceSvg], { type: 'image/svg+xml;charset=utf-8' }));
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(svgUrl);
    if (capturedRevision !== chartRevision) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1000;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas rendering is unavailable.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        if (capturedRevision !== chartRevision) return;
        if (blob) {
          download(blob, 'csv-chart.png');
          status('PNG export created in the browser.', 'success');
        } else status('Unable to create a PNG in this browser.', 'error');
      }, 'image/png');
    } catch (error) {
      status('PNG export failed: ' + error.message, 'error');
    }
  };
  image.onerror = () => {
    URL.revokeObjectURL(svgUrl);
    if (capturedRevision !== chartRevision) return;
    status('The browser could not read the generated SVG for PNG export.', 'error');
  };
  image.src = svgUrl;
});
