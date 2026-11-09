import {analyzeSeries} from './analysis.js';

const directions = {up: 'Рост', down: 'Снижение', stable: 'Без выраженного тренда'};

export function mountAnalysis(getContext, {format, localTime}) {
  const dialog = document.getElementById('analysis-dialog');
  const button = document.getElementById('analyze');
  const gpt = document.getElementById('analysis-gpt');
  const note = document.getElementById('analysis-note');
  const contextLabel = document.getElementById('analysis-context');
  const results = document.getElementById('analysis-results');
  const answer = document.getElementById('analysis-answer');
  let context;
  let request;
  let capability;

  function addResult(label, value) {
    const title = document.createElement('dt');
    const detail = document.createElement('dd');
    title.textContent = label;
    detail.textContent = value;
    results.append(title, detail);
  }

  async function open() {
    context = getContext();
    const selected = context;
    const {city, metric, hours, series, modelTime} = selected;
    const summary = analyzeSeries(series, selected.key === 'soil_moisture_0_to_1cm' ? .005 : .15);
    const unit = metric.unit || 'баллов';
    const describe = point => format(point.value) + ' ' + unit + ' · ' + localTime(point.timestamp);
    const stamp = Number.isFinite(modelTime) ? ' · ' + localTime(modelTime) + ' UTC+5' : '';
    contextLabel.textContent = city.name + ' · ' + metric.short + ' · ' + hours + ' ч' + stamp;
    results.replaceChildren();
    answer.textContent = '';
    answer.hidden = true;
    gpt.hidden = true;
    gpt.disabled = false;
    note.textContent = '';
    if (summary) {
      const delta = (summary.change > 0 ? '+' : '') + format(summary.change) + ' ' + unit;
      addResult('Тренд', directions[summary.direction] + ' · ' + delta + ' по линии тренда');
      addResult('Диапазон', describe(summary.minimum) + ' — ' + describe(summary.maximum));
      const peaks = summary.anomalies
        .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation))
        .slice(0, 3).map(describe);
      addResult('Отклонения', peaks.length ? summary.anomalies.length + ' · ' + peaks.join(', ') : 'Заметных отклонений от тренда нет');
      addResult('Данные', summary.points + ' из ' + hours + ' почасовых значений');
      note.textContent = 'Локальная модель по данным Open‑Meteo. Устойчивая регрессия оценивает тренд, а отклонения определяются относительно него.';
    } else {
      addResult('Данные', 'Для анализа нужно минимум восемь почасовых значений.');
    }
    dialog.showModal();
    if (!summary) return;

    capability ??= fetch('/api/analysis', {signal: AbortSignal.timeout(4000)})
      .then(async response => response.ok && (await response.json()).available === true)
      .catch(() => false);
    const available = await capability;
    if (dialog.open && context === selected) {
      gpt.hidden = !available;
      if (!available) note.textContent += ' Для текстового объяснения нужен серверный ключ AI_API_KEY.';
    }
  }

  async function explain() {
    const selected = context;
    if (!selected || request) return;
    const {city, key, hours, series, modelTime} = selected;
    const current = new AbortController();
    request = current;
    gpt.disabled = true;
    answer.hidden = false;
    answer.textContent = 'Готовим объяснение…';
    try {
      const response = await fetch('/api/analysis', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          city: city.name, metric: key, hours, modelTime,
          series: series.map(({timestamp, value}) => ({timestamp, value: value ?? null})),
        }),
        signal: AbortSignal.any([current.signal, AbortSignal.timeout(23000)]),
      });
      const data = await response.json();
      if (context !== selected || current.signal.aborted) return;
      answer.textContent = response.ok && typeof data.text === 'string'
        ? data.text : data.error || 'Объяснение временно недоступно.';
    } catch {
      if (context === selected && !current.signal.aborted) {
        answer.textContent = 'Объяснение временно недоступно. Попробуйте ещё раз.';
      }
    } finally {
      if (request === current) {
        request = null;
        gpt.disabled = false;
      }
    }
  }

  button.addEventListener('click', open);
  gpt.addEventListener('click', explain);
  document.getElementById('analysis-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    request?.abort();
    request = null;
    context = null;
  });
}
