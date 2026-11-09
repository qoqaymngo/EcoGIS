import {cities} from './data.js';

const rad = Math.PI / 180;
const mercator = lat => Math.log(Math.tan(Math.PI / 4 + lat * rad / 2)) / rad;
const latitude = y => (2 * Math.atan(Math.exp(y * rad)) - Math.PI / 2) / rad;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const countryLabels = [['ЗАПАДНО-КАЗАХСТАНСКАЯ ОБЛАСТЬ', 50.1, 49.15, true]];
const waterLabels = [['р. Урал', 51.55, 50.4]];
const regionLabels = [];

function pointInRing(x, y, ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}

function makePath(parts, polygon) {
  const path = new Path2D();
  for (const part of parts) {
    part.forEach(([lon, lat], i) => {
      if (i) path.lineTo(lon, -mercator(lat));
      else path.moveTo(lon, -mercator(lat));
    });
    if (polygon) path.closePath();
  }
  return path;
}

export function createMap(root, {markerInfo, popupContent, onSelect, onClose}) {
  const canvas = root.querySelector('canvas');
  const context = canvas.getContext('2d');
  const markerPane = root.querySelector('.markers');
  const popup = root.querySelector('.map-popup');
  const zoomIn = root.querySelector('#zoom-in');
  const zoomOut = root.querySelector('#zoom-out');
  const reset = root.querySelector('#reset-map');
  const cityMarkers = new Map();
  const countryView = {x: 50.54, y: mercator(49.9), zoom: 1};
  let view = {...countryView};
  let size = {w: 1, h: 1, dpr: 1};
  let geo;
  let showWater = true;
  let openCity = null;
  let frame = 0;
  let clusterButtons = new Map();
  let drag = null;
  let lastPointerMoved = false;
  const screenScale = () => Math.min(size.w / 10, size.h / 8) * view.zoom;
  const project = (lon, lat) => [
    size.w / 2 + (lon - view.x) * screenScale(),
    size.h / 2 + (view.y - mercator(lat)) * screenScale(),
  ];

  for (const city of cities) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'marker' + (city.featured ? ' featured' : '');
    const value = document.createElement('span');
    const label = document.createElement('span');
    label.className = 'city-label';
    label.textContent = city.name;
    label.setAttribute('aria-hidden', 'true');
    button.append(value, label);
    button.addEventListener('click', () => onSelect(city.id, false));
    markerPane.append(button);
    cityMarkers.set(city.id, {button, value});
  }

  function draw() {
    frame = 0;
    const {w, h, dpr} = size;
    const scale = screenScale();
    root.classList.toggle('show-labels', w >= 560 || view.zoom >= 1.9);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.fillStyle = '#eef2ec';
    context.fillRect(0, 0, w, h);
    context.save();
    context.translate(w / 2 - view.x * scale, h / 2 + view.y * scale);
    context.scale(scale, scale);

    function paint(path, fill, stroke, width, dash = []) {
      if (!path) return;
      if (fill) {
        context.fillStyle = fill;
        context.fill(path, 'evenodd');
      }
      if (stroke) {
        context.lineWidth = width / scale;
        context.strokeStyle = stroke;
        context.setLineDash(dash.map(value => value / scale));
        context.stroke(path);
      }
    }

    if (geo) {
      for (const district of geo.districts) {
        paint(district.path, district.id === openCity ? '#d1e8d7' : '#e3eedc', '#7b9c79', district.id === openCity ? 1.8 : 1);
      }
      paint(geo.grid, null, '#829c851f', 1, [2, 5]);
      if (showWater) {
        for (const lake of geo.lakes) paint(lake, '#c5e0e6', '#a9cdd4', .6);
        paint(geo.rivers, null, '#9dc8d1', 1);
      }
    } else {
      context.fillStyle = '#e3eedc';
      context.fillRect(view.x - w / scale, -view.y - h / scale, 2 * w / scale, 2 * h / scale);
    }
    context.restore();
    if (geo) drawLabels();
    drawMarkers();
    positionPopup();
    zoomIn.disabled = view.zoom >= 10;
    zoomOut.disabled = view.zoom <= .65;
    drawScale();
  }

  function drawLabels() {
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (const [name, lon, lat, focus] of countryLabels) {
      if (focus && size.w < 560) continue;
      if (focus && view.zoom > 1.65) continue;
      const [x, y] = project(lon, lat);
      context.font = focus ? '750 12px "Golos Text", Arial' : '700 10px "Golos Text", Arial';
      context.fillStyle = focus ? '#668264b3' : '#698476';
      context.fillText(name, x, y);
    }
    if (showWater && size.w >= 430) {
      context.font = 'italic 10px "Golos Text", Arial';
      context.fillStyle = '#497f8b';
      for (const [name, lon, lat] of waterLabels) context.fillText(name, ...project(lon, lat));
    }
    if (view.zoom >= 1.7) {
      context.font = '650 10px "Golos Text", Arial';
      context.fillStyle = '#6b856f';
      for (const [name, lon, lat] of regionLabels) context.fillText(name, ...project(lon, lat));
    }
  }

  function drawScale() {
    const lonKm = 111.32 * Math.cos(latitude(view.y) * rad);
    const pxPerKm = screenScale() / lonKm;
    const km = [1000, 500, 250, 100, 50, 25, 10].find(value => value * pxPerKm <= 92) ?? 10;
    const width = km * pxPerKm;
    const x = size.w - width - 13;
    const y = size.h - 21;
    context.fillStyle = '#ffffffb8';
    context.fillRect(x - 4, y - 14, width + 8, 19);
    context.strokeStyle = '#507261';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, y - 3);
    context.lineTo(x, y);
    context.lineTo(x + width, y);
    context.lineTo(x + width, y - 3);
    context.stroke();
    context.font = '650 9px "Golos Text", Arial';
    context.textAlign = 'center';
    context.textBaseline = 'bottom';
    context.fillStyle = '#426354';
    context.fillText(km + ' км', x + width / 2, y - 2);
  }

  function drawMarkers() {
    const groups = [];
    for (const city of cities) {
      const {button} = cityMarkers.get(city.id);
      const [x, y] = project(city.lon, city.lat);
      button.hidden = true;
      if (x < -10 || x > size.w + 10 || y < -10 || y > size.h + 10) continue;
      const group = city.id !== openCity && view.zoom < 9
        ? groups.find(item => item.ids[0] !== openCity && Math.hypot(x - item.x, y - item.y) < 26)
        : null;
      if (group) {
        group.ids.push(city.id);
        const count = group.ids.length;
        group.x += (x - group.x) / count;
        group.y += (y - group.y) / count;
      } else groups.push({ids: [city.id], x, y});
    }
    const next = new Map();
    for (const {ids, x, y} of groups) {
      if (ids.length === 1) {
        const {button} = cityMarkers.get(ids[0]);
        button.hidden = false;
        moveButton(button, x, y);
      } else {
        const key = ids.join(',');
        let button = clusterButtons.get(key);
        if (!button) {
          button = document.createElement('button');
          button.type = 'button';
          button.className = 'marker cluster light-text';
          const names = ids.map(id => cities.find(city => city.id === id).name).join(', ');
          button.title = names;
          button.setAttribute('aria-label', 'Приблизить · ' + names);
          button.textContent = ids.length;
          button.addEventListener('click', () => {
            const clusterX = Number.parseFloat(button.style.left);
            const clusterY = Number.parseFloat(button.style.top);
            view.x += (clusterX - size.w / 2) / screenScale();
            view.y -= (clusterY - size.h / 2) / screenScale();
            view.zoom = Math.min(10, view.zoom * 1.85);
            root.focus({preventScroll: true});
            schedule();
          });
          markerPane.append(button);
        }
        next.set(key, button);
        moveButton(button, x, y);
      }
    }
    for (const [key, button] of clusterButtons) if (!next.has(key)) button.remove();
    clusterButtons = next;
  }

  function moveButton(button, x, y) {
    button.style.left = x + 'px';
    button.style.top = y + 'px';
  }

  function positionPopup() {
    if (!openCity || popup.hidden) return;
    const city = cities.find(item => item.id === openCity);
    const [x, y] = project(city.lon, city.lat);
    const visible = x >= 0 && x <= size.w && y >= 0 && y <= size.h;
    popup.style.visibility = visible ? 'visible' : 'hidden';
    if (!visible) return;
    const popupX = clamp(x - popup.offsetWidth / 2, 7, size.w - popup.offsetWidth - 7);
    const proposedY = y - popup.offsetHeight - 20;
    popup.style.left = popupX + 'px';
    popup.style.top = clamp(proposedY >= 6 ? proposedY : y + 20, 6, size.h - popup.offsetHeight - 6) + 'px';
  }

  function schedule() {
    view.x = clamp(view.x, 46, 55);
    view.y = clamp(view.y, mercator(47.5), mercator(52.2));
    if (!frame) frame = requestAnimationFrame(draw);
  }

  function zoom(factor, x = size.w / 2, y = size.h / 2) {
    const oldScale = screenScale();
    view.zoom = clamp(view.zoom * factor, .65, 10);
    const delta = 1 / oldScale - 1 / screenScale();
    view.x += (x - size.w / 2) * delta;
    view.y -= (y - size.h / 2) * delta;
    schedule();
  }

  function update() {
    for (const city of cities) {
      const {button, value} = cityMarkers.get(city.id);
      const info = markerInfo(city);
      value.textContent = info.value;
      button.style.setProperty('--marker', info.color);
      button.classList.toggle('light-text', info.lightText);
      button.classList.toggle('selected', city.id === openCity);
      button.setAttribute('aria-label', info.description);
      button.setAttribute('aria-expanded', String(city.id === openCity));
    }
    if (openCity) {
      const focused = popup.contains(document.activeElement) ? document.activeElement.dataset.popup : null;
      popup.innerHTML = popupContent(openCity);
      popup.hidden = false;
      if (focused) popup.querySelector('[data-popup="' + focused + '"]')?.focus({preventScroll: true});
    } else {
      popup.hidden = true;
    }
    schedule();
  }

  function closePopup() {
    if (!openCity) return;
    const button = cityMarkers.get(openCity).button;
    if (popup.contains(document.activeElement)) button.focus({preventScroll: true});
    openCity = null;
    onClose();
    update();
  }

  function select(id, recenter) {
    const city = cities.find(item => item.id === id);
    if (!city) return;
    openCity = id;
    if (recenter) {
      view = {x: city.lon, y: mercator(city.lat), zoom: Math.max(2.1, view.zoom)};
    }
    update();
  }

  root.addEventListener('pointerdown', event => {
    if (event.button !== 0 || drag || event.target.closest('button, a, input, form, .map-popup, .legend')) return;
    drag = {id: event.pointerId, x: event.clientX, y: event.clientY, moved: false};
    lastPointerMoved = false;
  });
  root.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) {
      root.setPointerCapture(event.pointerId);
      root.classList.add('dragging');
    }
    drag.moved = true;
    view.x -= dx / screenScale();
    view.y += dy / screenScale();
    drag.x = event.clientX;
    drag.y = event.clientY;
    schedule();
  });
  const endDrag = event => {
    if (!drag || event.pointerId !== drag.id) return;
    lastPointerMoved = drag.moved;
    drag = null;
    root.classList.remove('dragging');
  };
  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);
  root.addEventListener('pointerleave', event => { if (!drag?.moved) endDrag(event); });
  canvas.addEventListener('click', event => {
    if (lastPointerMoved || !geo) return;
    const bounds = root.getBoundingClientRect();
    const lon = view.x + (event.clientX - bounds.left - size.w / 2) / screenScale();
    const lat = latitude(view.y - (event.clientY - bounds.top - size.h / 2) / screenScale());
    const district = geo.districts.find(item => item.polygons.some(rings => pointInRing(lon, lat, rings[0]) && !rings.slice(1).some(ring => pointInRing(lon, lat, ring))));
    if (district) onSelect(district.id, false);
    else closePopup();
  });
  root.addEventListener('dblclick', event => {
    if (event.target !== canvas) return;
    const bounds = root.getBoundingClientRect();
    zoom(1.5, event.clientX - bounds.left, event.clientY - bounds.top);
  });
  root.addEventListener('wheel', event => {
    if (!event.ctrlKey && !event.metaKey) return;
    if (event.target !== canvas && !event.target.closest('.marker')) return;
    event.preventDefault();
    const bounds = root.getBoundingClientRect();
    zoom(event.deltaY < 0 ? 1.22 : 1 / 1.22, event.clientX - bounds.left, event.clientY - bounds.top);
  }, {passive: false});
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && openCity && !root.querySelector('#city-query').matches(':focus')) {
      closePopup();
      return;
    }
    if (event.target !== root) return;
    const amount = 32 / screenScale();
    switch (event.key) {
      case 'ArrowLeft': view.x -= amount; break;
      case 'ArrowRight': view.x += amount; break;
      case 'ArrowUp': view.y += amount; break;
      case 'ArrowDown': view.y -= amount; break;
      case '+': case '=': zoom(1.4); break;
      case '-': zoom(1 / 1.4); break;
      default: return;
    }
    event.preventDefault();
    schedule();
  });
  zoomIn.addEventListener('click', () => zoom(1.4));
  zoomOut.addEventListener('click', () => zoom(1 / 1.4));
  reset.addEventListener('click', () => {
    view = {...countryView};
    closePopup();
    schedule();
  });
  popup.addEventListener('click', event => {
    if (event.target.closest('[data-popup="close"]')) closePopup();
  });
  new ResizeObserver(() => {
    const {width, height} = root.getBoundingClientRect();
    size = {w: width, h: height, dpr: Math.min(window.devicePixelRatio || 1, 2)};
    canvas.width = Math.max(1, Math.round(width * size.dpr));
    canvas.height = Math.max(1, Math.round(height * size.dpr));
    schedule();
  }).observe(root);

  fetch('geography.json')
    .then(response => {
      if (!response.ok) throw new Error('Карта недоступна');
      return response.json();
    })
    .then(data => {
      const grid = [];
      for (let x = 45; x <= 56; x += 1) grid.push([[x, 47], [x, 53]]);
      for (let y = 47; y <= 53; y += 1) grid.push([[45, y], [56, y]]);
      geo = {
        districts: data.districts.map(item => ({...item, path: makePath(item.polygons.flat(), true)})),
        lakes: data.lakes.map(polygons => makePath(polygons.flat(), true)),
        rivers: makePath(data.rivers, false),
        grid: makePath(grid, false),
      };
      schedule();
    })
    .catch(() => {
      root.querySelector('.map-credit').textContent = 'Картографическая основа недоступна';
    });
  document.fonts.ready.then(schedule);

  return {
    select, update, closePopup,
    reset() { view = {...countryView}; closePopup(); schedule(); },
    setWater(visible) { showWater = visible; schedule(); },
  };
}
