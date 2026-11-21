# CSV Chart Studio

Turn a CSV file into a clean, exportable bar, line, or scatter chart entirely in your browser. No accounts, remote services, external dependencies or analytics.

## Quick start

Serve the repository directory with any static HTTP server, for example:

    python3 -m http.server 8000

Open http://localhost:8000 in your browser. A local HTTP server is recommended because the app uses native JavaScript ES modules. You can also publish the root directory with any static web host.

1. Drop a CSV or TSV file onto the page, or paste CSV text, then choose **Read data**. The **Load sample data** action works without an existing file.
2. Select Bar, Line, or Scatter. Set the X and Y columns. The Y column must contain numeric values; scatter requires numeric X coordinates too.
3. Enter a chart title and choose **Export SVG** to save a scalable, self-contained image.

## Features

- CSV parser supporting quoted commas, embedded newlines, escaped quotation marks, CRLF/LF, UTF-8 BOM, and comma/semicolon/tab/pipe separators.
- Automatic delimiter detection or manual selection, duplicate and empty column names normalized for display.
- Column profiling for numeric Y-axis suggestions.
- Responsive, accessible chart studio with bar (up to 50 points), line (up to 250), and scatter (up to 1,000) charts.
- SVG axis labels, grid lines, point values and chart title, with XML-escaped data labels.
- Drag and drop, file picker, editable text input, sample data, 8-row table preview and SVG download.
- Explicit messages for malformed CSV, skipped values and point limits.
- No data is uploaded or transmitted by the app. Parsing and rendering happen locally.

## Limits and assumptions

- Input must include a header row and at least one data row, with consistent column counts.
- Pasted input is limited to 2,000,000 characters; file uploads are limited to 2 MB; maximum 10,000 records and 120 columns.
- Numeric cells accept finite decimal notation with a period decimal separator, including scientific notation. Currency symbols and locale-formatted values are not silently coerced.
- Row order is preserved for bar and line charts; scatter uses numeric X coordinates.
- This initial implementation has not been run through the owner's centralized test cycle.

## Structure

- index.html — interface and form
- styles.css — responsive styling
- app.js — local file reading, interactions, data preview and SVG export
- src/csv.js — CSV parser, delimiter detection, numeric profiling
- src/charts.js — accessible, self-contained SVG chart renderer

## License

License selection is pending. No licensing claims are made until a LICENSE is added.

## Author

Built by Meir Dvir · https://github.com/MeiRR17
