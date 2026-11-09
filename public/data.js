import {districts} from './districts.js';
export const cities = districts;

const bands = (limits, labels, colors) => labels.map((label, i) => ({
  label, max: limits[i] ?? Infinity, color: colors[i],
}));
const airColors = ['#42b38b', '#9ac867', '#e5bd51', '#e58f49', '#ca625e', '#925b8d'];
const aqBands = bands([20, 40, 60, 80, 100], ['0–20', '>20–40', '>40–60', '>60–80', '>80–100', '>100'], airColors);
['Хороший', 'Удовлетворительный', 'Умеренный', 'Плохой', 'Очень плохой', 'Крайне плохой'].forEach((label, i) => {
  aqBands[i].category = label;
});
const temperatureColors = ['#608bd2', '#71b1d7', '#9bd4c2', '#eac56b', '#dc8864'];
const windColors = ['#80cbb6', '#53ac9e', '#42928f', '#3e758b', '#3b587b'];
export const metrics = {
  european_aqi: {label: 'Качество воздуха', short: 'AQI', caption: 'Европейский AQI', unit: '', icon: 'wind', source: 'air', bands: aqBands},
  pm2_5: {label: 'PM2.5', short: 'PM2.5', caption: 'Мелкие частицы', unit: 'мкг/м³', icon: 'particles', source: 'air',
    bands: bands([5, 10, 25, 50, 75], ['0–5', '>5–10', '>10–25', '>25–50', '>50–75', '>75'], airColors)},
  pm10: {label: 'PM10', short: 'PM10', caption: 'Взвешенные частицы', unit: 'мкг/м³', icon: 'particles', source: 'air',
    bands: bands([10, 20, 45, 75, 100], ['0–10', '>10–20', '>20–45', '>45–75', '>75–100', '>100'], airColors)},
  nitrogen_dioxide: {label: 'NO₂', short: 'NO₂', caption: 'Диоксид азота', unit: 'мкг/м³', icon: 'wind', source: 'air',
    bands: bands([10, 20, 40, 80, 120], ['0–10', '>10–20', '>20–40', '>40–80', '>80–120', '>120'], airColors)},
  temperature_2m: {label: 'Температура', short: 'Температура', caption: 'На высоте 2 м', unit: '°C', icon: 'temp', source: 'weather',
    bands: bands([-10, 0, 10, 25], ['≤−10', '>−10–0', '>0–10', '>10–25', '>25'], temperatureColors)},
  wind_speed_10m: {label: 'Скорость ветра', short: 'Ветер', caption: 'На высоте 10 м', unit: 'м/с', icon: 'wind', source: 'weather',
    bands: bands([2, 5, 8, 12], ['0–2', '>2–5', '>5–8', '>8–12', '>12'], windColors)},
};
metrics.soil_temperature_0cm = {label: 'Температура почвы', short: 'Почва · температура', caption: 'Поверхность · 0 см', unit: '°C', icon: 'temp', source: 'weather',
  bands: bands([-5, 0, 10, 25], ['≤−5', '>−5–0', '>0–10', '>10–25', '>25'], temperatureColors)};
metrics.soil_moisture_0_to_1cm = {label: 'Влажность почвы', short: 'Почва · влажность', caption: 'Слой 0–1 см · объёмная доля', unit: 'м³/м³', icon: 'drop', source: 'weather',
  bands: bands([.1, .2, .3, .4], ['0–0,1', '>0,1–0,2', '>0,2–0,3', '>0,3–0,4', '>0,4'], ['#dca96d', '#ddc88b', '#9cc795', '#62a995', '#3a8390'])};

export const endpoints = {
  air: 'https://air-quality-api.open-meteo.com/v1/air-quality',
  weather: 'https://api.open-meteo.com/v1/forecast',
};
export const sourceKeys = Object.keys(endpoints);

export function requestUrl(source) {
  const keys = Object.keys(metrics).filter(key => metrics[key].source === source);
  const url = new URL(endpoints[source]);
  const params = {
    latitude: cities.map(city => city.lat).join(','),
    longitude: cities.map(city => city.lon).join(','),
    current: keys.join(','),
    hourly: keys.join(','),
    past_days: '2',
    forecast_days: '1',
    timeformat: 'unixtime',
    timezone: 'GMT',
    ...(source === 'air' ? {domains: 'cams_global'} : {wind_speed_unit: 'ms'}),
  };
  url.search = new URLSearchParams(params);
  return url;
}

export function indexResponse(source, rows) {
  const key = Object.keys(metrics).find(key => metrics[key].source === source);
  if (!Array.isArray(rows) || rows.length !== cities.length ||
      !rows.some(row => Number.isFinite(row?.current?.time) && Number.isFinite(row?.current?.[key]))) {
    throw new Error('Некорректный ответ источника данных');
  }
  return Object.fromEntries(cities.map((city, index) => [city.id, rows[index]]));
}
