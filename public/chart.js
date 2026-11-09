const hour = 3600;

export function historyFor(row, metric, hours) {
  const time = row?.current?.time;
  if (!Number.isFinite(time) || !Array.isArray(row?.hourly?.time)) return [];
  return row.hourly.time.flatMap((timestamp, i) => {
    if (timestamp <= time - hours * hour || timestamp > time) return [];
    return [{timestamp, value: row.hourly[metric]?.[i]}];
  });
}

export function drawChart(container, points, {format, date, time, unit, label}) {
  const values = points.map(point => point.value).filter(Number.isFinite);
  if (!values.length) {
    container.innerHTML = '<div class="chart-empty">Почасовые данные для этого города недоступны</div>';
    container.removeAttribute('tabindex');
    container.removeAttribute('role');
    container.removeAttribute('aria-label');
    container.onpointermove = container.onpointerleave = container.onkeydown = null;
    return;
  }
  const width = Math.max(240, Math.round(container.clientWidth));
  const height = 204;
  const plot = {left: 37, top: 13, right: width - 19, bottom: height - 32};
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const stepGuess = Math.max(.001, (rawMax - rawMin) / 3.5, Math.abs(rawMax) * .005);
  const magnitude = 10 ** Math.floor(Math.log10(stepGuess));
  const step = ([1, 2, 2.5, 5, 10].find(value => value >= stepGuess / magnitude) ?? 10) * magnitude;
  const min = Math.floor(rawMin / step) * step;
  const max = Math.max(min + step * 2, Math.ceil(rawMax / step) * step);
  const x = index => plot.left + index / Math.max(1, points.length - 1) * (plot.right - plot.left);
  const y = value => plot.bottom - (value - min) / (max - min) * (plot.bottom - plot.top);
  let ticks = '';
  for (let value = min; value <= max + step / 1000; value += step) {
    const py = y(value);
    ticks += '<path d="M' + plot.left + ' ' + py + 'H' + plot.right + '" stroke="#e4ede6"/>' +
      '<text x="' + (plot.left - 7) + '" y="' + (py + 3) + '" text-anchor="end">' + format(value) + '</text>';
  }
  const count = width > 650 ? 7 : width > 420 ? 5 : 3;
  for (let i = 0; i < Math.min(count, points.length); i++) {
    const index = Math.round(i * (points.length - 1) / Math.max(1, count - 1));
    const align = i === 0 ? 'start' : i === count - 1 ? 'end' : 'middle';
    const stamp = points[index].timestamp;
    const axisLabel = points.length > 25 && width > 420 ? date(stamp) + ' ' + time(stamp) : time(stamp);
    ticks += '<text x="' + x(index) + '" y="' + (height - 10) + '" text-anchor="' + align + '">' + axisLabel + '</text>';
  }
  const segments = [];
  let segment = [];
  points.forEach((point, i) => {
    if (Number.isFinite(point.value)) segment.push([x(i), y(point.value)]);
    else if (segment.length) {
      segments.push(segment);
      segment = [];
    }
  });
  if (segment.length) segments.push(segment);
  const series = segments.map(path => {
    if (path.length === 1) return '<circle cx="' + path[0][0] + '" cy="' + path[0][1] + '" r="4" fill="#218561"/>';
    const line = 'M' + path.map(pair => pair.join(',')).join('L');
    const fill = line + 'V' + plot.bottom + 'H' + path[0][0] + 'Z';
    return '<path d="' + fill + '" fill="url(#area)"/><path d="' + line + '" fill="none" stroke="#218561" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round"/>';
  }).join('');
  container.innerHTML = '<svg viewBox="0 0 ' + width + ' ' + height + '" aria-hidden="true">' +
    '<defs><linearGradient id="area" x2="0" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="#75c8a0" stop-opacity=".40"/><stop offset="1" stop-color="#75c8a0" stop-opacity=".04"/></linearGradient></defs>' +
    ticks + series + '<g data-cursor visibility="hidden"><line y1="' + plot.top + '" y2="' + plot.bottom + '" stroke="#53917a" stroke-dasharray="4 3"/>' +
    '<circle r="4" fill="#218561" stroke="white" stroke-width="1.5"/></g></svg><div class="chart-tooltip" hidden></div>';
  container.tabIndex = 0;
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', label + '. Для просмотра значений используйте клавиши влево и вправо.');
  const cursor = container.querySelector('[data-cursor]');
  const circle = cursor.querySelector('circle');
  const tooltip = container.querySelector('.chart-tooltip');
  let active = null;

  function display(index, keyboard = false) {
    active = index;
    const point = points[index];
    const px = x(index);
    const valid = Number.isFinite(point.value);
    cursor.setAttribute('visibility', 'visible');
    cursor.setAttribute('transform', 'translate(' + px + ' 0)');
    circle.setAttribute('visibility', valid ? 'visible' : 'hidden');
    if (valid) circle.setAttribute('cy', y(point.value));
    tooltip.textContent = date(point.timestamp) + ' ' + time(point.timestamp) + ' · ' +
      (valid ? [format(point.value), unit].filter(Boolean).join(' ') : 'Нет данных');
    tooltip.hidden = false;
    tooltip.style.left = Math.max(0, Math.min(px - tooltip.offsetWidth / 2, width - tooltip.offsetWidth)) + 'px';
    tooltip.style.top = Math.max(0, (valid ? y(point.value) : plot.top) - 29) + 'px';
    if (keyboard) document.getElementById('announcement').textContent = tooltip.textContent;
  }

  function hide() {
    active = null;
    cursor.setAttribute('visibility', 'hidden');
    circle.setAttribute('visibility', 'hidden');
    tooltip.hidden = true;
  }

  container.onpointermove = event => {
    const relative = (event.clientX - container.getBoundingClientRect().left - plot.left) / (plot.right - plot.left);
    display(Math.min(points.length - 1, Math.max(0, Math.round(relative * (points.length - 1)))));
  };
  container.onpointerleave = hide;
  container.onblur = hide;
  container.onkeydown = event => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = active === null ? points.length - 1 : active + (event.key === 'ArrowRight' ? 1 : -1);
    display(Math.min(points.length - 1, Math.max(0, index)), true);
  };
}
