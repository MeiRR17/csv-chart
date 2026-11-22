/**
 * Pearson's r for only the scatter points actually plotted (max 1,000).
 * Scale each finite axis to [-1, 1] before online centered covariance to
 * avoid overflow from large original coordinates. No cell values or labels
 * are returned; r itself may still disclose information about the data.
 *
 * This is descriptive linear association only, not a significance test,
 * measure of causation, or a full-dataset result if chart points were capped.
 */
export function plottedScatterCorrelation(prepared, plotted) {
  if (!prepared || prepared.type !== 'scatter' ||
      !Array.isArray(prepared.prepared) ||
      !Number.isSafeInteger(plotted) || plotted < 1 ||
      plotted > 1000 || plotted > prepared.prepared.length) {
    throw new TypeError('Expected a bounded plotted scatter series.');
  }
  const points = prepared.prepared.slice(0, plotted);
  let maxX = 0, maxY = 0;
  for (const point of points) {
    if (!point || typeof point.x !== 'number' || !Number.isFinite(point.x) ||
        typeof point.y !== 'number' || !Number.isFinite(point.y)) {
      throw new TypeError('Scatter points require finite numeric coordinates.');
    }
    maxX = Math.max(maxX, Math.abs(point.x));
    maxY = Math.max(maxY, Math.abs(point.y));
  }
  const undefinedResult = reason => ({
    points: plotted, coefficient: null, reason,
    scope: 'plotted_scatter_points_only',
  });
  if (points.length < 2) return undefinedResult('insufficient_points');
  if (maxX === 0 || maxY === 0) return undefinedResult('constant_axis');

  let meanX = 0, meanY = 0, m2x = 0, m2y = 0, coMoment = 0;
  for (let index = 0; index < points.length; index++) {
    const x = points[index].x / maxX;
    const y = points[index].y / maxY;
    const n = index + 1;
    const dx = x - meanX;
    meanX += dx / n;
    const dy = y - meanY;
    meanY += dy / n;
    m2x += dx * (x - meanX);
    m2y += dy * (y - meanY);
    coMoment += dx * (y - meanY);
  }
  if (!(m2x > 0 && m2y > 0)) return undefinedResult('constant_axis');
  const denominator = Math.sqrt(m2x) * Math.sqrt(m2y);
  const raw = coMoment / denominator;
  if (!Number.isFinite(raw)) return undefinedResult('numeric_precision');
  return {
    points: plotted,
    coefficient: Math.max(-1, Math.min(1, raw)),
    reason: null,
    scope: 'plotted_scatter_points_only',
  };
}
