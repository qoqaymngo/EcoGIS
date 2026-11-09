import {cities, metrics, indexResponse, requestUrl, sourceKeys} from './data.js';
import {createMap} from './map.js';
import {drawChart, historyFor} from './chart.js';
import {mountAnalysis} from './analysis-ui.js';
import {mountChat} from './chat-ui.js';

const $ = id => document.getElementById(id);
const icon = name => '<svg class="icon" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
const byId = Object.fromEntries(cities.map(city => [city.id, city]));
const fmt = new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 3});
const dateFmt = new Intl.DateTimeFormat('ru-RU', {timeZone: 'Asia/Qyzylorda', day: 'numeric', month: 'short'});
const timeFmt = new Intl.DateTimeFormat('ru-RU', {timeZone: 'Asia/Qyzylorda', hour: '2-digit', minute: '2-digit'});
const format = value => Number.isFinite(value) ? fmt.format(value) : '—';
const formatDate = time => dateFmt.format(time * 1000);
const formatTime = time => timeFmt.format(time * 1000);
const localTime = time => formatDate(time) + ' · ' + formatTime(time);
const announce = message => { $('announcement').textContent = message; };

const storageKey = 'ecogis.wko.data.v2';
const noBand = {label: 'Нет данных', color: '#879b92'};
const tableKeys = ['european_aqi', 'pm2_5', 'pm10', 'nitrogen_dioxide', 'temperature_2m', 'soil_moisture_0_to_1cm', 'soil_temperature_0cm'];
const state = {
  metric: 'european_aqi',
  city: 'oral',
  district: '',
  popup: null,
  hours: 24,
  sort: 'name',
  direction: 1,
  alertOnly: false,
  results: {},
  status: 'loading',
};

function rowFor(id, metric) {
  return state.results[metrics[metric].source]?.byCity[id];
}

function valueFor(id, metric) {
  return rowFor(id, metric)?.current?.[metric];
}

function bandFor(key, value) {
  return Number.isFinite(value) ? metrics[key].bands.find(band => value <= band.max) : noBand;
}

function badge(value, showValue = true) {
  const band = bandFor('european_aqi', value);
  const label = Number.isFinite(value) ? (showValue ? format(value) + ' · ' : '') + band.category : noBand.label;
  return '<span class="badge" style="--badge-dot:' + band.color + ';--badge-bg:color-mix(in srgb,' +
    band.color + ' 18%,white);--badge-text:#304639"><i></i>' + label + '</span>';
}

function markerInfo(city) {
  const key = state.metric;
  const value = valueFor(city.id, key);
  const band = bandFor(key, value);
  const description = [city.name, metrics[key].short, Number.isFinite(value) ? format(value) : noBand.label, Number.isFinite(value) ? metrics[key].unit : ''].filter(Boolean).join(' · ');
  const [r, g, b] = band.color.slice(1).match(/.{2}/g).map(channel => {
    const s = parseInt(channel, 16) / 255;
    return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
  });
  return {description, value: format(value), color: band.color, lightText: .2126 * r + .7152 * g + .0722 * b < .22};
}

function popupContent(id) {
  const city = byId[id];
  const key = state.metric;
  const metric = metrics[key];
  const value = valueFor(id, key);
  const modelTime = rowFor(id, key)?.current?.time;
  const suffix = Number.isFinite(value) && key === 'european_aqi' ? '<span class="popup-category">' + bandFor(key, value).category + '</span>' : '';
  return '<div class="popup-head"><div><h3>' + city.name + '</h3><small>' + city.region + '</small></div>' +
    '<button class="popup-close" type="button" data-popup="close" aria-label="Закрыть карточку">' + icon('x') + '</button></div>' +
    '<div class="popup-value"><strong>' + format(value) + '</strong><small>' + (metric.unit || metric.short) + '</small>' + suffix + '</div>' +
    '<div class="popup-time">' + (Number.isFinite(modelTime) ? localTime(modelTime) + ' · UTC+5' : noBand.label) + '</div>' +
    '<a href="#history" data-popup="history" class="popup-link">Динамика показателя ' + icon('arrow') + '</a>';
}

const map = createMap($('map'), {
  markerInfo, popupContent, onSelect: selectCity,
  onClose() { state.popup = null; renderTable(); },
});

function selectCity(id, recenter = true) {
  if (!byId[id]) return;
  state.city = id;
  state.district = id;
  $('district-filter').value = id;
  state.popup = id;
  $('chart-city').value = id;
  map.select(id, recenter);
  renderChart();
  renderTable();
  announce('Выбрана точка ' + byId[id].name);
}

function renderSummary() {
  const airValues = key => cities.map(city => valueFor(city.id, key)).filter(Number.isFinite);
  const aqi = airValues('european_aqi');
  const pm = airValues('soil_moisture_0_to_1cm');
  const average = values => values.length ? values.reduce((total, item) => total + item, 0) / values.length : null;
  const avgAqi = average(aqi);
  $('kpi-aqi').textContent = format(avgAqi);
  $('kpi-aqi-note').innerHTML = Number.isFinite(avgAqi) ? badge(avgAqi, false) : 'Европейский индекс качества воздуха';
  $('kpi-pm').innerHTML = format(average(pm)) + (pm.length ? '<small>м³/м³</small>' : '');
  $('kpi-alert').textContent = aqi.length ? aqi.filter(value => value > 40).length : '—';
  $('kpi-total').textContent = cities.length;
  $('kpi-coverage').textContent = aqi.length ? 'Данные AQI для ' + aqi.length + ' из ' + cities.length : '12 районов и Уральск';
}

function renderSourceStatus() {
  const labels = {
    loading: 'Загрузка данных', live: 'Данные обновлены',
    cached: 'Последние данные', partial: 'Часть данных из архива', empty: 'Источник недоступен',
  };
  $('source-status').dataset.state = state.status === 'partial' ? 'cached' : state.status;
  $('status-text').textContent = labels[state.status];
  $('source-status').title = {
    loading: 'Запрашиваем Open‑Meteo',
    live: 'Модельные данные получены из Open‑Meteo',
    cached: 'Open‑Meteo недоступен. Показаны сохранённые данные.',
    partial: 'Один из источников Open‑Meteo недоступен.',
    empty: 'Повторите запрос по кнопке «Обновить».',
  }[state.status];
  const stamp = state.results.air?.stamp ?? state.results.weather?.stamp;
  $('data-time').textContent = Number.isFinite(stamp) ? localTime(stamp) : state.status === 'loading' ? 'Загрузка…' : 'Нет данных';
  $('data-time').title = state.results.air ? 'Время модельных данных качества воздуха' : 'Время модельных данных погоды';
}

function renderLegend() {
  const metric = metrics[state.metric];
  $('legend').innerHTML = '<div class="legend-head">' + metric.short + (metric.unit ? ' · ' + metric.unit : ' · европейская шкала') +
    '</div><div class="legend-items">' + metric.bands.map(band =>
      '<span class="legend-item" title="' + (band.category ?? band.label) + '"><i class="legend-swatch" style="background:' + band.color + '"></i>' + band.label + '</span>'
    ).join('') + '</div>';
}

function renderChart() {
  const key = state.metric;
  const metric = metrics[key];
  const city = byId[state.city];
  $('chart-key').innerHTML = '<span class="chart-dot"></span>' + city.name + ' · ' + metric.short + (metric.unit ? ' · ' + metric.unit : '');
  const row = rowFor(city.id, key);
  drawChart($('chart-view'), historyFor(row, key, state.hours), {
    format, date: formatDate, time: formatTime, unit: metric.unit, label: city.name + ' · ' + metric.label,
  });
}

function analysisContext() {
  const {metric: key, city, hours} = state;
  const row = rowFor(city, key);
  return {
    city: byId[city], key, metric: metrics[key], hours,
    modelTime: row?.current?.time, series: historyFor(row, key, hours),
    observations: Object.fromEntries(Object.keys(metrics).map(metric => [metric, {
      value: valueFor(city, metric) ?? null, time: rowFor(city, metric)?.current?.time ?? null,
    }])),
  };
}
mountAnalysis(analysisContext, {format, localTime});
mountChat(analysisContext, {
  getData: () => ({...state.results}),
  showOnMap(action) {
    if (action.metric && metrics[action.metric]) {
      state.metric = action.metric;
      $('layers').querySelector('input[value="' + state.metric + '"]').checked = true;
      renderLegend();
      map.update();
    }
    if ([24, 48].includes(action.hours)) {
      state.hours = action.hours;
      $('periods').querySelectorAll('button').forEach(button => {
        button.setAttribute('aria-pressed', String(Number(button.dataset.hours) === state.hours));
      });
    }
    if (action.district_id && byId[action.district_id]) selectCity(action.district_id);
    else renderChart();
  },
});

const districtSelect = $('district-filter');
for (const city of cities) {
  const option = document.createElement('option');
  option.value = city.id;
  option.textContent = city.region === 'Город областного значения' ? city.name : city.region;
  districtSelect.append(option);
}
districtSelect.addEventListener('change', () => {
  state.district = districtSelect.value;
  if (state.district) selectCity(state.district);
  else { map.reset(); renderTable(); }
});

const normalize = input => input.trim().toLowerCase().replace(/ё/g, 'е').replace(/[‐‑–—]/g, '-');
const matchCities = query => {
  const needle = normalize(query);
  return cities.filter(city => normalize(city.name + ' ' + city.region).includes(needle));
};

function visibleRows() {
  const rows = matchCities($('table-query').value).filter(city => (!state.district || city.id === state.district) && (!state.alertOnly || valueFor(city.id, 'european_aqi') > 40));
  const {sort, direction} = state;
  return rows.sort((a, b) => {
    if (sort === 'name') return direction * a.name.localeCompare(b.name, 'ru');
    const av = valueFor(a.id, sort);
    const bv = valueFor(b.id, sort);
    if (!Number.isFinite(av)) return Number.isFinite(bv) ? 1 : 0;
    if (!Number.isFinite(bv)) return -1;
    return direction * (av - bv);
  });
}

function renderTable() {
  const rows = visibleRows();
  $('table-count').textContent = rows.length + ' / ' + cities.length;
  $('download').disabled = !rows.length || !sourceKeys.some(source => state.results[source]);
  document.querySelectorAll('[data-th]').forEach(th => {
    if (th.dataset.th === state.sort) th.setAttribute('aria-sort', state.direction > 0 ? 'ascending' : 'descending');
    else th.removeAttribute('aria-sort');
  });
  const tbody = $('points-body');
  const focusedId = tbody.contains(document.activeElement) ? document.activeElement.dataset.city : null;
  tbody.innerHTML = rows.length ? rows.map(city =>
    '<tr' + (city.id === state.popup ? ' class="selected"' : '') + '><td><span class="city-name">' + city.name + '</span><span class="region-name">' + city.region +
    '</span></td>' + tableKeys.map(key => {
      const value = valueFor(city.id, key);
      if (key === 'european_aqi') return '<td>' + badge(value) + '</td>';
      return '<td>' + format(value) + (Number.isFinite(value) ? ' ' + metrics[key].unit : '') + '</td>';
    }).join('') + '<td><button type="button" class="table-map" data-city="' + city.id + '" aria-label="Показать на карте · ' + city.name + '" title="Показать на карте">' + icon('pin') + '</button></td></tr>'
  ).join('') : '<tr><td colspan="9" class="table-empty">Точек по этому фильтру нет</td></tr>';
  if (focusedId) tbody.querySelector('[data-city="' + focusedId + '"]')?.focus({preventScroll: true});
}

function renderData() {
  renderSourceStatus();
  renderSummary();
  renderTable();
  renderChart();
  map.update();
}

function accept(source, data, fromCache = false) {
  const byCity = indexResponse(source, data);
  const times = data.map(row => row?.current?.time).filter(Number.isFinite);
  const stamp = Math.min(...times);
  const previous = state.results[source]?.stamp ?? -Infinity;
  if (stamp > previous || (stamp === previous && !fromCache)) {
    state.results[source] = {byCity, data, stamp};
  }
}

function applySaved(saved) {
  for (const source of sourceKeys) {
    try {
      if (saved?.[source]) accept(source, saved[source], true);
    } catch {
      // A malformed cache entry must not block requests to the source.
    }
  }
}

function save() {
  const result = Object.fromEntries(sourceKeys.map(source => [source, state.results[source]?.data]));
  try { localStorage.setItem(storageKey, JSON.stringify(result)); } catch { /* Storage is optional. */ }
}

async function refresh() {
  const button = $('refresh');
  if (button.disabled) return;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  state.status = 'loading';
  renderSourceStatus();
  const outcomes = await Promise.allSettled(sourceKeys.map(async source => {
    const response = await fetch(requestUrl(source), {signal: AbortSignal.timeout(14000), cache: 'no-store'});
    if (!response.ok) throw new Error('Ошибка ' + response.status);
    accept(source, await response.json());
    renderData();
  }));
  const updated = outcomes.filter(result => result.status === 'fulfilled').length;
  state.status = updated === sourceKeys.length ? 'live'
    : updated ? 'partial'
      : sourceKeys.some(source => state.results[source]) ? 'cached' : 'empty';
  if (updated) save();
  button.disabled = false;
  button.setAttribute('aria-busy', 'false');
  renderData();
  announce($('status-text').textContent);
}

$('layers').insertAdjacentHTML('beforeend', Object.entries(metrics).map(([key, metric]) =>
  '<label class="layer-row"><input type="radio" name="metric" value="' + key + '"' + (key === state.metric ? ' checked' : '') +
  '><span class="layer-icon">' + icon(metric.icon) + '</span><span class="layer-text">' + metric.label + '<small>' + metric.caption +
  '</small></span><span class="radio-mark" aria-hidden="true"></span></label>'
).join(''));

$('layers').addEventListener('change', event => {
  if (!metrics[event.target.value]) return;
  state.metric = event.target.value;
  renderLegend();
  map.update();
  renderChart();
  announce('На карте ' + metrics[state.metric].label);
});
$('reset-map').addEventListener('click', () => {
  state.district = '';
  $('district-filter').value = '';
  renderTable();
});
$('water-toggle').addEventListener('change', event => map.setWater(event.target.checked));

$('chart-city').innerHTML = [...cities].sort((a, b) => a.name.localeCompare(b.name, 'ru')).map(city =>
  '<option value="' + city.id + '">' + city.name + '</option>'
).join('');
$('chart-city').value = state.city;
$('chart-city').addEventListener('change', event => {
  selectCity(event.target.value, false);
});
$('periods').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  state.hours = Number(button.dataset.hours);
  $('periods').querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  renderChart();
});
let chartWidth = 0;
new ResizeObserver(([entry]) => {
  const width = Math.round(entry.contentRect.width);
  if (width === chartWidth) return;
  chartWidth = width;
  renderChart();
}).observe($('chart-view'));

const cityQuery = $('city-query');
const results = $('map-results');
function renderSearch() {
  if (!cityQuery.value.trim()) {
    results.hidden = true;
    return;
  }
  const matches = matchCities(cityQuery.value);
  results.innerHTML = matches.length ? matches.slice(0, 8).map(city =>
    '<li><button type="button" data-city="' + city.id + '">' + city.name + '<small>' + city.region + '</small></button></li>'
  ).join('') : '<li class="search-empty">Район не найден</li>';
  results.hidden = false;
}
function goToSearchCity(id) {
  cityQuery.value = '';
  results.hidden = true;
  $('map').focus({preventScroll: true});
  selectCity(id);
}
cityQuery.addEventListener('input', renderSearch);
cityQuery.addEventListener('focus', renderSearch);
$('map-search').addEventListener('submit', event => {
  event.preventDefault();
  if (!results.hidden) {
    const first = results.querySelector('button');
    if (first) goToSearchCity(first.dataset.city);
  }
});
$('map-search').addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    event.stopPropagation();
    results.hidden = true;
    cityQuery.focus({preventScroll: true});
    results.hidden = true;
    return;
  }
  if (results.hidden || !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
  const options = [...results.querySelectorAll('button')];
  if (!options.length) return;
  event.preventDefault();
  const index = options.indexOf(document.activeElement);
  if (event.key === 'ArrowDown') options[Math.min(index + 1, options.length - 1)].focus();
  else if (index <= 0) cityQuery.focus();
  else options[index - 1].focus();
});
results.addEventListener('click', event => {
  const button = event.target.closest('[data-city]');
  if (button) goToSearchCity(button.dataset.city);
});
document.addEventListener('click', event => {
  if (!event.target.closest('#map-search')) results.hidden = true;
});
$('map-search').addEventListener('focusout', event => {
  if (!$('map-search').contains(event.relatedTarget)) results.hidden = true;
});

function setExpanded(expanded) {
  $('map-card').classList.toggle('expanded', expanded);
  document.body.classList.toggle('map-expanded', expanded);
  const label = expanded ? 'Свернуть карту' : 'Развернуть карту';
  $('expand').setAttribute('aria-label', label);
  $('expand').setAttribute('aria-pressed', String(expanded));
  $('expand').title = label;
  $('expand').innerHTML = icon(expanded ? 'x' : 'expand');
  const shell = document.querySelector('main');
  for (const element of [...shell.children, document.querySelector('.topbar'), document.querySelector('.footer')]) {
    if (!element.contains($('map-card'))) element.inert = expanded;
  }
  document.querySelector('.map-sidebar').inert = expanded;
}
$('expand').addEventListener('click', () => setExpanded($('expand').getAttribute('aria-pressed') !== 'true'));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && $('map-card').classList.contains('expanded') && !state.popup) {
    setExpanded(false);
    $('expand').focus();
  }
});
$('map-popup').addEventListener('click', event => {
  if (!event.target.closest('[data-popup="history"]')) return;
  if ($('map-card').classList.contains('expanded')) setExpanded(false);
  state.city = state.popup;
  $('chart-city').value = state.city;
  renderChart();
  $('chart-city').focus({preventScroll: true});
});

$('table-query').addEventListener('input', renderTable);
$('alert-filter').addEventListener('click', event => {
  state.alertOnly = !state.alertOnly;
  event.currentTarget.setAttribute('aria-pressed', String(state.alertOnly));
  renderTable();
});
document.querySelector('thead').addEventListener('click', event => {
  const button = event.target.closest('[data-sort]');
  if (!button) return;
  const key = button.dataset.sort;
  state.direction = state.sort === key ? -state.direction : key === 'name' ? 1 : -1;
  state.sort = key;
  renderTable();
});
$('points-body').addEventListener('click', event => {
  const button = event.target.closest('[data-city]');
  if (!button) return;
  selectCity(button.dataset.city);
  $('map-card').scrollIntoView({block: 'start'});
  $('map').focus({preventScroll: true});
});

$('download').addEventListener('click', () => {
  const rows = visibleRows();
  if (!rows.length) return;
  const keys = Object.keys(metrics);
  const header = ['Точка', 'Район', 'Широта', 'Долгота', 'Время модели воздуха (UTC)', 'Время модели погоды (UTC)',
    ...keys.map(key => metrics[key].short + (metrics[key].unit ? ' (' + metrics[key].unit + ')' : ''))];
  const isoTime = row => Number.isFinite(row?.current?.time) ? new Date(row.current.time * 1000).toISOString() : '';
  const records = rows.map(city => [
    city.name, city.region, city.lat, city.lon,
    isoTime(rowFor(city.id, 'european_aqi')), isoTime(rowFor(city.id, 'temperature_2m')),
    ...keys.map(key => valueFor(city.id, key) ?? ''),
  ]);
  const quote = value => '"' + String(value).replace(/"/g, '""') + '"';
  const content = [header, ...records].map(record => record.map(quote).join(',')).join('\r\n') + '\r\n';
  const url = URL.createObjectURL(new Blob(['\uFEFF', content], {type: 'text/csv;charset=utf-8'}));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'ecogis-zko.csv';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

const method = $('methodology');
document.querySelectorAll('[data-method]').forEach(link => link.addEventListener('click', event => {
  event.preventDefault();
  method.showModal();
}));
$('close-method').addEventListener('click', () => method.close());
method.addEventListener('click', event => { if (event.target === method) method.close(); });
function markSection() {
  const points = location.hash === '#points';
  document.querySelectorAll('nav a:not([data-method])').forEach(link => {
    const active = link.hash === (points ? '#points' : '#overview');
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}
window.addEventListener('hashchange', markSection);
markSection();
if (location.hash === '#methodology') method.showModal();

$('refresh').addEventListener('click', refresh);
renderLegend();
try { applySaved(JSON.parse(localStorage.getItem(storageKey))); } catch { /* Storage is optional. */ }
renderData();
fetch('snapshot.json')
  .then(response => response.ok ? response.json() : null)
  .then(saved => {
    applySaved(saved);
    if (state.status === 'empty' && sourceKeys.some(source => state.results[source])) state.status = 'cached';
    renderData();
  })
  .catch(() => {});
refresh();
setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 30 * 60 * 1000);
