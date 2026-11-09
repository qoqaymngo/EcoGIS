import {askChat} from './chat.js';

export function mountChat(getContext, {getData, showOnMap}) {
  const dialog = document.getElementById('chat-dialog');
  const log = document.getElementById('chat-messages');
  const mode = document.getElementById('chat-mode');
  const input = document.getElementById('chat-input');
  const send = document.getElementById('chat-send');
  let context;
  let history = [];
  let contextKey = '';
  let pending;
  let generation = 0;

  function append(role, text) {
    const bubble = document.createElement('p');
    bubble.className = 'chat-message ' + role;
    bubble.textContent = text;
    log.append(bubble);
    log.scrollTop = log.scrollHeight;
  }

  async function open() {
    const sequence = ++generation;
    context = getContext();
    const key = [context.city.id, context.key, context.hours, context.modelTime].join(':');
    document.getElementById('chat-context').textContent =
      context.city.region + ' · ' + context.metric.short + ' · ' + context.hours + ' ч' +
      (Number.isFinite(context.modelTime) ? ' · ' + new Intl.DateTimeFormat('ru-RU', {timeZone: 'Asia/Qyzylorda', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}).format(context.modelTime * 1000) + ' UTC+5' : '');
    if (contextKey !== key) {
      contextKey = key;
      history = [];
      log.replaceChildren();
      append('assistant', 'Я помогу разобраться в данных выбранного района. Можно спросить о тренде, влажности почвы или значении показателя.');
    }
    mode.textContent = 'Проверяем подключение ИИ…';
    input.disabled = true;
    send.disabled = true;
    dialog.showModal();
    try {
      const response = await fetch('/api/chat', {signal: AbortSignal.timeout(5000)});
      const data = response.ok ? await response.json() : {};
      if (sequence !== generation || !dialog.open) return;
      const available = data.available === true;
      mode.textContent = available
        ? (data.label || 'ИИ') + ' · доступ к данным районов и управлению картой'
        : 'Для ИИ-чата настройте AI_API_KEY на сервере. Локальный анализ доступен в разделе динамики.';
      input.disabled = !available;
      send.disabled = !available;
      if (available) input.focus();
    } catch {
      if (sequence === generation && dialog.open) mode.textContent = 'Сервер ИИ недоступен. Запустите проект командой npm start.';
    }
  }

  document.getElementById('chat-form').addEventListener('submit', async event => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question || input.disabled || pending) return;
    const selected = context;
    const current = new AbortController();
    pending = current;
    const messages = [...history, {role: 'user', content: question}].slice(-12);
    append('user', question);
    input.value = '';
    input.disabled = true;
    send.disabled = true;
    const placeholder = document.createElement('p');
    placeholder.className = 'chat-message assistant';
    placeholder.textContent = 'Помощник отвечает…';
    log.append(placeholder);
    log.scrollTop = log.scrollHeight;
    try {
      const data = await askChat({
        context: selected, history: messages, results: getData(),
        signal: AbortSignal.any([current.signal, AbortSignal.timeout(65000)]),
      });
      if (current.signal.aborted) return;
      placeholder.textContent = data.text;
      history = [...messages, {role: 'assistant', content: data.text.slice(0, 3000)}].slice(-11);
      if (data.action) {
        showOnMap(data.action);
        context = getContext();
        contextKey = [context.city.id, context.key, context.hours, context.modelTime].join(':');
        document.getElementById('chat-context').textContent = context.city.region + ' · ' + context.metric.short + ' · ' + context.hours + ' ч';
        mode.textContent = 'Карта и график показывают выбранную помощником территорию.';
      }
    } catch (error) {
      if (!current.signal.aborted) {
        placeholder.textContent = error.name === 'TimeoutError' ? 'Помощник отвечает слишком долго. Уточните вопрос или повторите запрос.' : error.message || 'Не удалось получить ответ. Попробуйте снова.';
        input.value = question;
      }
    } finally {
      if (pending === current) {
        pending = null;
        input.disabled = false;
        send.disabled = false;
        log.scrollTop = log.scrollHeight;
        if (dialog.open) input.focus();
      }
    }
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      document.getElementById('chat-form').requestSubmit();
    }
  });
  document.getElementById('open-chat').addEventListener('click', open);
  document.getElementById('chat-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    generation++;
    pending?.abort();
    pending = null;
  });
}
