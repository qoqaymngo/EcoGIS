// Chat orchestration and map tools adapted from
// https://github.com/diarmadiev09-netizen/ecogis-zko/blob/main/web/chat.js
// Source blob 9e133aa34e9d03ab9aab0e4aca998fa62600cabd.
import {cities, metrics} from './data.js';
import {historyFor} from './chart.js';

const MAX_STEPS = 8;
const byId = Object.fromEntries(cities.map(city => [city.id, city]));
const metricKeys = Object.keys(metrics);

function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * rad / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lon2 - lon1) * rad / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}

function checkSelection(values, allowed) {
  return Array.isArray(values) && values.every(value => typeof value === 'string' && allowed.includes(value));
}

export function makeTools(results, actions) {
  return {
    list_districts: () => ({
      data_kind: 'model', time_zone: 'UTC+5',
      districts: cities.map(city => ({id: city.id, name: city.name, territory: city.region, lon: city.lon, lat: city.lat})),
      metrics: metricKeys.map(key => ({key, label: metrics[key].label, unit: metrics[key].unit})),
    }),

    get_monitoring_data: ({district_ids = [], metrics: selectedMetrics = [], hours = 24, include_hourly = false}) => {
      if (!checkSelection(district_ids, cities.map(city => city.id)) || !checkSelection(selectedMetrics, metricKeys)
          || ![24, 48].includes(hours) || typeof include_hourly !== 'boolean') throw new Error('Неверный район, показатель или период');
      const ids = district_ids.length ? [...new Set(district_ids)] : cities.map(city => city.id);
      const keys = selectedMetrics.length ? [...new Set(selectedMetrics)] : metricKeys;
      if (include_hourly && (ids.length > 2 || keys.length > 2)) throw new Error('Запросите почасовые данные максимум для двух районов и двух показателей');
      return {
        data_kind: 'model', source: 'Open-Meteo / Copernicus CAMS',
        territories: ids.map(id => ({
          id, name: byId[id].name,
          metrics: keys.map(key => {
            const row = results[metrics[key].source]?.byCity[id];
            const item = {key, unit: metrics[key].unit, value: row?.current?.[key] ?? null, time_unix_utc: row?.current?.time ?? null};
            if (include_hourly) item.hourly = historyFor(row, key, hours).map(({timestamp, value}) => [timestamp, value ?? null]);
            return item;
          }),
        })),
      };
    },

    find_monitoring_points_near: ({lon, lat, radius_km}) => {
      if (!Number.isFinite(lon) || Math.abs(lon) > 180 || !Number.isFinite(lat) || Math.abs(lat) > 90
          || !Number.isFinite(radius_km) || radius_km < 0 || radius_km > 2000) throw new Error('Неверные координаты или радиус');
      return cities.map(city => ({
        id: city.id, name: city.name,
        distance_km: Math.round(distanceKm(lat, lon, city.lat, city.lon) * 10) / 10,
      })).filter(point => point.distance_km <= radius_km).sort((a, b) => a.distance_km - b.distance_km);
    },

    show_on_map: input => {
      const {district_id, metric, hours} = input;
      if ((district_id !== undefined && !byId[district_id]) || (metric !== undefined && !metrics[metric])
          || (hours !== undefined && ![24, 48].includes(hours))
          || !['district_id', 'metric', 'hours'].some(key => input[key] !== undefined)) {
        throw new Error('Неверный район, показатель или период');
      }
      actions.push({
        ...(district_id !== undefined ? {district_id} : {}),
        ...(metric !== undefined ? {metric} : {}),
        ...(hours !== undefined ? {hours} : {}),
      });
      return {status: 'Карта и график переключатся после завершения ответа'};
    },
  };
}

// The source bot's bounded tool loop uses the existing server-side AI proxy.
export async function askChat({context, history, results, signal}) {
  const messages = history.map(message => ({...message}));
  const actions = [];
  const tools = makeTools(results, actions);
  for (let step = 0; step < MAX_STEPS; step++) {
    signal.throwIfAborted();
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        city: context.city.name, metric: context.key, hours: context.hours,
        modelTime: context.modelTime, observations: context.observations,
        series: context.series.map(({timestamp, value}) => ({timestamp, value: value ?? null})),
        messages,
      }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(23000)]),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Ответ ИИ временно недоступен.');
    const calls = Array.isArray(data.toolCalls) ? data.toolCalls : [];
    if (!calls.length) {
      if (typeof data.text !== 'string' || !data.text.trim()) throw new Error('Помощник вернул пустой ответ.');
      return {text: data.text, action: actions.length ? Object.assign({}, ...actions) : null};
    }
    messages.push({role: 'assistant', content: data.text || null, tool_calls: calls});
    for (const call of calls) {
      signal.throwIfAborted();
      let output;
      try {
        const args = JSON.parse(call.function?.arguments || '{}');
        const run = Object.hasOwn(tools, call.function?.name) ? tools[call.function.name] : null;
        if (!run || !args || Array.isArray(args) || typeof args !== 'object') throw new Error('Неизвестный инструмент или неверные аргументы');
        output = run(args);
      } catch (error) {
        output = {error: error.message};
      }
      messages.push({role: 'tool', tool_call_id: call.id, content: JSON.stringify(output)});
    }
  }
  throw new Error('Помощник выполнил восемь шагов. Уточните район и показатель в следующем вопросе.');
}
