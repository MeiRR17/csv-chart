// No network access, dependencies, or CSV content evaluation.
const MAX_SOURCE_LENGTH = 2_000_000;
const MAX_DATA_ROWS = 10_000;
const MAX_RECORDS = MAX_DATA_ROWS + 1; // Header is not a data row.
const MAX_COLUMNS = 120;
const DELIMITERS = [',', ';', '\t', '|'];

/** Choose a delimiter from up to five complete logical records (quotes are respected). */
export function detectDelimiter(source) {
  const counts = new Map(DELIMITERS.map(separator => [separator, []]));
  const current = Object.fromEntries(DELIMITERS.map(separator => [separator, 0]));
  let quoted = false;
  let records = 0;
  for (let i = 0; i < source.length && records < 5; i++) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { i++; continue; }
      quoted = !quoted;
    } else if (!quoted) {
      if (Object.hasOwn(current, char)) current[char]++;
      if (char === '\n' || char === '\r') {
        for (const separator of DELIMITERS) {
          counts.get(separator).push(current[separator]);
          current[separator] = 0;
        }
        records++;
        if (char === '\r' && source[i + 1] === '\n') i++;
      }
    }
  }
  if (records < 5) {
    for (const separator of DELIMITERS) counts.get(separator).push(current[separator]);
  }
  let best = ',', highest = 0;
  for (const separator of DELIMITERS) {
    const positives = counts.get(separator).filter(count => count > 0);
    if (!positives.length) continue;
    const min = Math.min(...positives);
    const mean = positives.reduce((sum, count) => sum + count, 0) / positives.length;
    const score = (positives.length * 2 + min) * mean / (1 + Math.max(...positives) - min);
    if (score > highest) { highest = score; best = separator; }
  }
  return best;
}

/**
 * Parse RFC 4180-style quoted CSV cells (including escaped quotes and newlines).
 * The first nonempty row supplies column names. Duplicate names get numeric suffixes.
 * Throws helpful errors on malformed input rather than shifting data between columns.
 */
export function parseCsv(source, delimiter = 'auto') {
  if (typeof source !== 'string') throw new TypeError('CSV content must be text.');
  if (source.length > MAX_SOURCE_LENGTH) throw new RangeError('CSV exceeds the 2 MB limit.');
  source = source.replace(/^\uFEFF/, '');
  const separator = delimiter === 'auto' ? detectDelimiter(source) : delimiter;
  if (!DELIMITERS.includes(separator)) throw new Error('Unsupported delimiter.');

  const records = [];
  let cells = [];
  let cell = '';
  let quoted = false;
  let quoteClosed = false;
  let atStart = true;

  function finishCell() {
    cells.push(cell);
    cell = '';
    atStart = true;
    quoteClosed = false;
    if (cells.length > MAX_COLUMNS) throw new RangeError('CSV exceeds 120 columns.');
  }
  function finishRecord() {
    finishCell();
    if (cells.some(value => value.trim().length > 0)) records.push(cells);
    cells = [];
    if (records.length > MAX_RECORDS) throw new RangeError('CSV exceeds 10,000 data rows.');
  }

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; quoteClosed = true; }
      } else cell += char;
    } else if (char === separator) finishCell();
    else if (char === '\r' || char === '\n') {
      finishRecord();
      if (char === '\r' && source[i + 1] === '\n') i++;
    } else if (char === '"') {
      if (!atStart) throw new SyntaxError('Unexpected quote near character ' + (i + 1) + '.');
      quoted = true;
      atStart = false;
    } else {
      if (quoteClosed) throw new SyntaxError('Characters found after a closing quote near ' + (i + 1) + '.');
      cell += char;
      atStart = false;
    }
  }
  if (quoted) throw new SyntaxError('Unclosed quoted cell in CSV.');
  if (cell || cells.length || quoteClosed) finishRecord();
  if (records.length < 2) throw new Error('Add a header row and at least one data row.');

  const headers = records.shift();
  const used = new Set();
  const columns = headers.map((entry, i) => {
    const original = entry.trim() || 'Column ' + (i + 1);
    let name = original;
    let suffix = 2;
    while (used.has(name)) name = original + ' (' + suffix++ + ')';
    used.add(name);
    return name;
  });
  const rows = records.map((record, i) => {
    if (record.length !== columns.length) {
      throw new SyntaxError('Row ' + (i + 2) + ' has ' + record.length + ' cells; expected ' + columns.length + '.');
    }
    return record;
  });
  return { columns, rows, delimiter: separator };
}

const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

/** Accept only unambiguous finite decimal numbers, not empty strings or JS coercions. */
export function numericValue(value) {
  const trimmed = String(value).trim();
  if (!NUMBER_PATTERN.test(trimmed)) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : null;
}

export function columnProfile(rows, index) {
  let numeric = 0, filled = 0;
  for (const row of rows) {
    if (row[index].trim() === '') continue;
    filled++;
    if (numericValue(row[index]) !== null) numeric++;
  }
  return { numeric, filled, fraction: filled ? numeric / filled : 0 };
}
