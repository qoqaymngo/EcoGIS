const hour = 3600;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return (sorted[mid] + sorted[Math.ceil(sorted.length / 2) - 1]) / 2;
}

export function analyzeSeries(series, minimumChange = .15) {
  const points = series.filter(point => Number.isFinite(point.value));
  if (points.length < 8) return null;
  const start = points[0].timestamp;
  const last = points.at(-1).timestamp;
  const span = (last - start) / hour;
  if (span < 7) return null;

  // Fit the typical trend to pairwise slopes so that spikes affect it less.
  const slopes = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const elapsed = (points[j].timestamp - points[i].timestamp) / hour;
      if (elapsed > 0) slopes.push((points[j].value - points[i].value) / elapsed);
    }
  }
  const slope = median(slopes);
  const offsets = points.map(point => point.value - slope * (point.timestamp - start) / hour);
  const intercept = median(offsets);
  const residuals = offsets.map(offset => offset - intercept);
  const noise = 1.4826 * median(residuals.map(value => Math.abs(value)));
  const values = points.map(point => point.value);
  const center = median(values);
  const threshold = Math.max(3.5 * noise, Math.abs(center) * .05, minimumChange);
  const anomalies = points.flatMap((point, i) => Math.abs(residuals[i]) > threshold
    ? [{...point, deviation: residuals[i]}] : []);
  const change = slope * span;
  const direction = Math.abs(change) <= Math.max(noise, Math.abs(center) * .05, minimumChange)
    ? 'stable' : change > 0 ? 'up' : 'down';
  const minimum = points.reduce((best, point) => point.value < best.value ? point : best);
  const maximum = points.reduce((best, point) => point.value > best.value ? point : best);
  return {
    points: points.length,
    direction, change, minimum, maximum, anomalies,
  };
}
