# CSV Chart Studio

Turn a CSV file into a clean, exportable bar, line, or scatter chart entirely in your browser. No accounts, remote services, external dependencies or analytics.

## Quick start

Serve the repository directory with any static HTTP server, for example:

    python3 -m http.server 8000

Open http://localhost:8000 in your browser. A local HTTP server is recommended because the app uses native JavaScript ES modules. You can also publish the root directory with any static web host.

1. Drop a CSV or TSV file onto the page, or paste CSV text, then choose **Read data**. The **Load sample data** action works without an existing file.
2. Select Bar, Line, or Scatter. Set the X and Y columns. The Y column must contain numeric values; scatter requires numeric X coordinates too.
3. Optionally group repeated X labels by **sum**, **average**, or **count**, and sort the chart by X or Y. Scatter plots always use raw numeric points.
4. Enter a chart title and choose **SVG** or **PNG** for your chart image; **Chart CSV** exports the data behind the current chart.

## Features

- CSV parser supporting quoted commas, embedded newlines, escaped quotation marks, CRLF/LF, UTF-8 BOM, and comma/semicolon/tab/pipe separators.
- Automatic delimiter detection or manual selection, duplicate and empty column names normalized for display.
- Column profiling for numeric Y-axis suggestions.
- **Column quality overview**: per-column missing-cell counts, numeric versus nonnumeric values, exact distinct-value counts and an inferred numeric/text/mixed/empty classification, calculated without uploading source data.
- Download a JSON **column profile** with column names, counts and inferred classifications; no source cell values are included.
- Responsive, accessible chart studio with bar (up to 50 points), line (up to 250), and scatter (up to 1,000) charts.
- SVG axis labels, grid lines, point values and chart title, with XML-escaped data labels.
- Non-mutating chart-data preparation with grouping by exact X labels, sum/average/count aggregations and optional sort by X or Y.
- Prepared-value statistics: number of categories or records, minimum, maximum and mean; invalid numeric rows are counted and excluded explicitly.
- Export the current chart as vector SVG or 2× resolution raster PNG (1920 × 1000) entirely in the browser.
- Export the prepared X/Y series as a UTF-8 CSV with a BOM and formula-like text-label escaping so spreadsheet software does not execute CSV labels as formulas.
- Drag and drop, file picker, editable text input, sample data, 8-row table preview and SVG download.
- Explicit messages for malformed CSV, skipped values and point limits.
- No data is uploaded or transmitted by the app. Parsing and rendering happen locally.

## Limits and assumptions

- Input must include a header row and at least one data row, with consistent column counts.
- Pasted input is limited to 2,000,000 characters; file uploads are limited to 2 MB; maximum 10,000 records and 120 columns.
- Numeric cells accept finite decimal notation with a period decimal separator, including scientific notation. Currency symbols and locale-formatted values are not silently coerced.
- Column profiling uses the existing 10,000-row/120-column parser bounds. Uniqueness counts compare trimmed text values exactly and are *not* deduplication recommendations; format classification is not an accuracy or data-quality certification.
- Row order is preserved by default for bar and line charts; the sort menu can change it. Scatter uses numeric X coordinates and does not permit grouping.
- Aggregate operations include only rows with a numeric Y value. Count represents the count of valid numeric Y rows per X category, not every raw CSV row.
- Each chart retains its readability cap (50 bar, 250 line, 1,000 scatter); the exported chart-data CSV contains **all prepared rows**, not just the first visible plotted points.
- Exporting chart data may include confidential information if your category labels are sensitive; review downloads before sharing. The column profile excludes **cell values** but includes **column names**, which may still be sensitive.
- This initial implementation has not been run through the owner's centralized test cycle.

## Structure

- index.html — interface and form
- styles.css — responsive styling
- app.js — local file reading, interactions, data preview and SVG export
- src/csv.js — CSV parser, delimiter detection, numeric profiling
- src/charts.js — accessible, self-contained SVG chart renderer
- src/transform.js — aggregation, sorting, summary statistics and safe chart-data CSV export
- src/profile.js — per-column completeness, distinct-count and numeric-consistency analysis

## License

MIT. See [LICENSE](./LICENSE).

## Author

Built by Meir Dvir · https://github.com/MeiRR17
