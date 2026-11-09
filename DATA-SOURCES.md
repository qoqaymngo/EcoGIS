# Источники данных

- Административный состав ЗКО, 12 районов и Уральск — [Акимат ЗКО](https://www.gov.kz/org/bko?lang=ru).
- Границы районов — [Open dataset of administrative boundaries of Kazakhstan](https://www.arcgis.com/home/item.html?id=e7c6ab14781c4729a1cb20ffef9cde0d), основанный на OpenStreetMap. Выгружены 9 ноября 2026 года с пространственным упрощением 0,003 градуса. GeoJSON содержится в `public/district-boundaries.geojson`.
- © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). Границы и их адаптация распространяются по ODbL.
- Реки и озёра — [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/), public domain.
- Качество воздуха — [Open‑Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api) / Copernicus CAMS. Глобальная модель, примерно 45 км.
- Погода, температура и влажность почвы — [Open‑Meteo Weather Forecast API](https://open-meteo.com/en/docs).
- Для Grok используется [xAI Responses API](https://docs.x.ai/developers/model-capabilities/text/best-practices), для Groq — [Groq Chat Completions](https://console.groq.com/docs/openai). Сервер выбирает API согласно настройке AI_PROVIDER.
- Шрифт Golos Text поставляется с лицензией в `public/golos-license.txt`.

Для районов расчетная точка выбрана внутри наиболее крупной части полигона. Для Уральска заданы координаты города. Эти точки используются как координаты запросов модели.

Логика ИИ-бота адаптирована из [ecogis-zko/web/chat.js](https://github.com/diarmadiev09-netizen/ecogis-zko/blob/main/web/chat.js), исходный blob 9e133aa34e9d03ab9aab0e4aca998fa62600cabd. Авторы исходного проекта — Қолқанат, Дияр, Аслан.

Gemini подключается через [официальный OpenAI-совместимый API Google](https://ai.google.dev/gemini-api/docs/openai). Служебные подписи вызовов инструментов сохраняются при передаче результатов модели.
