import {metrics} from './data.js';

// Adapted from web/chat.js in diarmadiev09-netizen/ecogis-zko.
// The hosted project provides hourly model data instead of synthetic monthly data.
const metricKeys = Object.keys(metrics);
export const CHAT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_districts',
      description: 'Все 12 районов ЗКО и Уральск, их id, координаты расчетных точек и доступные показатели.',
      parameters: {type: 'object', properties: {}, additionalProperties: false},
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_monitoring_data',
      description: 'Текущие модельные значения по районам и их время. Без фильтров — все точки и показатели. Почасовой ряд за 24 или 48 часов запрашивай с include_hourly=true, максимум для двух районов и двух показателей за один вызов.',
      parameters: {
        type: 'object',
        properties: {
          district_ids: {type: 'array', items: {type: 'string'}, maxItems: 13},
          metrics: {type: 'array', items: {type: 'string', enum: metricKeys}, maxItems: 8},
          hours: {type: 'integer', enum: [24, 48]},
          include_hourly: {type: 'boolean'},
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_monitoring_points_near',
      description: 'Найти расчетные точки в радиусе от координат WGS84 и расстояния до них в километрах. Это точки модельных оценок.',
      parameters: {
        type: 'object',
        properties: {lon: {type: 'number'}, lat: {type: 'number'}, radius_km: {type: 'number'}},
        required: ['lon', 'lat', 'radius_km'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'show_on_map',
      description: 'Показать район, показатель и период графика на карте сайта. Вызывай, если пользователь просит показать конкретную территорию или показатель.',
      parameters: {
        type: 'object',
        properties: {
          district_id: {type: 'string'},
          metric: {type: 'string', enum: metricKeys},
          hours: {type: 'integer', enum: [24, 48]},
        },
        additionalProperties: false,
      },
    },
  },
];
