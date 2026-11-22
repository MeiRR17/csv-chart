# CSV Chart Studio

Turn a CSV file into a clean, exportable bar, line, or scatter chart entirely in your browser. No accounts, remote services, external dependencies or analytics.

## Quick start

Serve the repository directory with any static HTTP server, for example:

    python3 -m http.server 8000

Open http://localhost:8000 in your browser. A local HTTP server is recommended because the app uses native JavaScript ES modules. You can also publish the root directory with any static web host.

1. Drop a CSV or TSV file onto the page, or paste CSV text, then choose **Read data**. The **Load sample data** action works without an existing file.
2. Select Bar, Line, or Scatter. Set the X and Y columns. The Y column must contain numeric values; scatter requires numeric X coordinates too.
3. Optionally group repeated X labels by **sum**, **average**, **count**, **minimum**, or **maximum**, and sort the chart by X or Y. Scatter plots always use raw numeric points.
4. Enter a chart title and choose **SVG** or **PNG** for your chart image; **Chart CSV** exports all prepared chart data. **Plotted CSV** exports only the points actually drawn on the SVG after chart caps are applied; **Stats JSON** exports only numeric prepared-series statistics and completeness counts.

## Features

- CSV parser supporting quoted commas, embedded newlines, escaped quotation marks, CRLF/LF, UTF-8 BOM, and comma/semicolon/tab/pipe separators. File uploads use **strict UTF-8 decoding**: invalid byte sequences are rejected instead of silently replacing characters in labels or values.
- Automatic delimiter detection or manual selection, duplicate and empty column names normalized for display.
- Column profiling for numeric Y-axis suggestions.
- **Column quality overview**: per-column missing-cell counts, numeric versus nonnumeric values, exact distinct-value counts and an inferred numeric/text/mixed/empty classification, calculated without uploading source data.
- Download a **column profile** as JSON or spreadsheet-compatible CSV with column names, counts, completeness percentages and inferred classifications; no source cell values are included. Formula-like column headers are escaped in the CSV to reduce spreadsheet injection risk.
- Responsive, accessible chart studio with bar (up to 50 points), line (up to 250), and scatter (up to 1,000) charts.
- SVG axis labels, grid lines, point values and chart title, with XML-escaped data labels.
- Non-mutating chart-data preparation with grouping by exact X labels, sum/average/count/minimum/maximum aggregations and optional sort by X or Y.
- Prepared-series statistics: number of categories or records, minimum, **median**, mean, **90th percentile (P90)** and maximum.
- **Scatter-only Pearson correlation:** after rendering a scatter chart, the statistics panel displays Pearson's `r` for **only the first points actually drawn** (up to 1,000), with a distinct `undefined` state for fewer than two points or a constant/numerically unresolved axis. It uses centered online covariance with normalized finite coordinates to reduce overflow risk; negative and positive coefficients indicate *linear association*, not statistical significance, prediction or causation. Chart ordering and the 1,000-point cap can affect the reported association. Non-scatter charts never claim a correlation.
- Export **Stats JSON** for the current prepared series: counts of source/excluded/prepared/plotted rows, **mutually exclusive reasons for excluded rows** (missing Y, nonnumeric Y, missing scatter X, nonnumeric scatter X), aggregation and sorting modes, minimum, median, mean, P90, maximum and total. It deliberately omits raw CSV records, column names, category labels and chart title; numeric aggregates can still disclose commercially sensitive information. For scatter plots only, it additionally includes a content-free `plottedScatterCorrelation` object (`points`, numeric `coefficient` or `null`, fixed `reason`, and `scope: plotted_scatter_points_only`). Y-axis statistics still describe *all prepared* values, while correlation describes only the plotted subset. It never exports individual X/Y pairs. The report is invalidated on chart settings or source edits and never claims to summarize rows excluded by numeric parsing. Median and P90 use linear interpolation between ordered values and apply to the prepared Y series (category aggregates when grouping), not the omitted/invalid source rows.
- Export the current chart as vector SVG or 2× resolution raster PNG (1920 × 1000) entirely in the browser.
- Export the prepared X/Y series as a UTF-8 CSV with a BOM and formula-like text-label escaping so spreadsheet software does not execute CSV labels as formulas.
- Export a separate **Plotted CSV** containing precisely the first 50 bar, 250 line, or 1,000 scatter *prepared points actually rendered* (or fewer, if the dataset is shorter) after aggregation/sorting. This makes it easy to compare chart artwork to its underlying displayed series, rather than incorrectly treating **Chart CSV** (all prepared points) as identical to a truncated chart. Both exports preserve the same three-column X/Y/source-row-count layout and spreadsheet formula precautions. Plotted CSV excludes points omitted for chart readability; it is not a statistics-only or anonymized export.
- Drag and drop, file picker, editable text input, sample data, 8-row table preview and SVG download.
- Explicit messages for malformed CSV, skipped values and point limits. After rendering, excluded rows are broken down into missing versus nonnumeric Y values; scatter charts additionally distinguish missing and nonnumeric X values. Y is evaluated first, so a row with two invalid axes is counted only once. These are parsing diagnostics, not judgments about whether the underlying observations are correct. Extreme finite numbers that would generate non-finite SVG axis coordinates now fail with a clear range error rather than malformed artwork.
- No data is uploaded or transmitted by the app. Parsing and rendering happen locally.

## Limits and assumptions

- Input must include a header row and at least one data row, with consistent column counts.
- Pasted input is limited to 2,000,000 characters; file uploads are limited to 2 MB; maximum **10,000 data rows plus one header** and 120 columns.
- Numeric cells accept finite decimal notation with a period decimal separator, including scientific notation. Currency symbols and locale-formatted values are not silently coerced.
- Column profiling uses the existing 10,000-row/120-column parser bounds. Uniqueness counts compare trimmed text values exactly and are *not* deduplication recommendations; format classification is not an accuracy or data-quality certification.
- Row order is preserved by default for bar and line charts; the sort menu can change it. Scatter uses numeric X coordinates and does not permit grouping.
- Exclusion counts are computed over the original input rows before grouping and sorting, and their four categories sum exactly to `excludedRows`; missing X labels on bar/line charts remain valid categorical labels, so X exclusions apply only to scatter plots. The Stats JSON projection validates this reconciliation and never exports raw rejected values.
- Aggregate operations include only rows with a finite numeric Y value. Count represents the count of valid numeric Y rows per X category, not every raw CSV row. Minimum and maximum select the smallest/largest finite Y value for each exact X category. Count/minimum/maximum do not calculate intermediate sums, so they do not fail solely because the sum of large values would overflow.
- Each chart retains its readability cap (50 bar, 250 line, 1,000 scatter); **Chart CSV** contains **all prepared rows**, while **Plotted CSV** contains only the points drawn in the current rendered chart. Both export options are disabled when the source, column selection, chart settings or title invalidates the preview.
- Exporting chart data may include confidential information if your category labels are sensitive; review downloads before sharing. The column profile excludes **cell values** but includes **column names**, which may still be sensitive.
- When a file load finishes after the user has edited the source or selected another file, its stale result is ignored. Editing the chart title immediately invalidates prior SVG/PNG/chart-data exports even before the title field loses focus; the completed title is rendered on change. Changing or clearing the chart also cancels any in-flight PNG image conversion so an outdated chart cannot be exported by mistake.
- This initial implementation has not been run through the owner's centralized test cycle.

## Structure

- index.html — interface and form
- styles.css — responsive styling
- app.js — local file reading, interactions, data preview and SVG export
- src/csv.js — CSV parser, delimiter detection, numeric profiling
- src/charts.js — accessible, self-contained SVG chart renderer
- src/transform.js — aggregation, sorting, summary statistics, redacted statistics JSON and safe full-series/plotted-only chart CSV exports
- src/correlation.js — overflow-resistant Pearson r for bounded plotted scatter points
- src/profile.js — per-column completeness, distinct-count and numeric-consistency analysis
- src/profile-csv.js — metadata-only CSV export with formula-like header escaping

## License

MIT. See [LICENSE](./LICENSE).

## Author

Built by Meir Dvir · https://github.com/MeiRR17
