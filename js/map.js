import { MAPBOX_TOKEN } from './config.js';
import { waypoints } from './data.js';
import state from './state.js';
import { $ } from './dom.js';
import { applySky, flyToDay, setupCameraDrag } from './camera.js';
import { buildRoute } from './route.js';

export function hideLabels() {
  try {
    for (const l of state.map.getStyle().layers) {
      if (l.type === 'symbol') state.map.setLayoutProperty(l.id, 'visibility', 'none');
    }
  } catch (e) { console.warn('Could not hide labels:', e); }
}

export function addBuildings() {
  try {
    if (!state.map.getSource('composite') || state.map.getLayer('3d-buildings')) return;
    let labelLayer;
    for (const l of state.map.getStyle().layers) {
      if (l.type === 'symbol' && l.layout && l.layout['text-field']) { labelLayer = l.id; break; }
    }
    state.map.addLayer({
      id: '3d-buildings', source: 'composite', 'source-layer': 'building',
      type: 'fill-extrusion', minzoom: 13,
      paint: {
        'fill-extrusion-color': '#b8a079',
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 15.5, ['coalesce', ['get', 'height'], 6]],
        'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
        'fill-extrusion-opacity': 0.85
      }
    }, labelLayer);
  } catch (e) { console.warn('3D buildings layer skipped:', e); }
}

export function buildMarkers() {
  waypoints.forEach((w, i) => {
    const el = document.createElement('div');
    el.className = 'wp future';
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `Day ${w.day}: ${w.name}`);
    el.setAttribute('tabindex', '0');
    if (i === waypoints.length - 1) { el.classList.add('k2'); el.innerHTML = '<span class="flag">⚑</span>'; }
    el.addEventListener('click', ev => {
      ev.stopPropagation();
      import('./ui.js').then(ui => { ui.stopPlay(); ui.goToDay(i); });
    });
    el.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        import('./ui.js').then(ui => { ui.stopPlay(); ui.goToDay(i); });
      }
    });
    const m = new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat(w.coords).addTo(state.map);
    state.markers[i] = m;
  });
}

function sizeFor(s, isK2) {
  if (s === 'current') return isK2 ? 22 : 16;
  if (s === 'past') return isK2 ? 14 : 10;
  return isK2 ? 12 : 8;
}

export function updateMarkers() {
  state.markers.forEach((m, i) => {
    const el = m.getElement();
    const isK2 = (i === waypoints.length - 1);
    el.classList.remove('past', 'current', 'future');
    const st = i === state.current ? 'current' : (i < state.current ? 'past' : 'future');
    el.classList.add(st);
    const s = sizeFor(st, isK2);
    el.style.width = s + 'px';
    el.style.height = s + 'px';
    el.style.zIndex = st === 'current' ? 6 : (st === 'past' ? 3 : 2);
  });
}

export function initMap() {
  if (!MAPBOX_TOKEN || MAPBOX_TOKEN === 'YOUR_MAPBOX_TOKEN') {
    $('warn').style.display = 'flex';
    import('./ui.js').then(ui => {
      ui.buildChart();
      ui.render();
      ui.bindUI();
    });
    return;
  }
  mapboxgl.accessToken = MAPBOX_TOKEN;

  const bounds = new mapboxgl.LngLatBounds();
  waypoints.forEach(w => bounds.extend(w.coords));

  state.map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/satellite-streets-v12',
    bounds,
    fitBoundsOptions: { padding: 60 },
    pitch: 50, bearing: 25, maxPitch: 85, antialias: true, projection: 'globe'
  });

  state.map.on('error', e => {
    if (e && e.error && /401|403|token|unauthor/i.test(String(e.error.message || ''))) {
      $('warn').style.display = 'flex';
    }
  });

  state.map.on('load', async () => {
    state.map.addSource('mapbox-dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 });
    state.map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.35 });
    applySky();
    hideLabels();
    addBuildings();
    setupCameraDrag();

    buildMarkers();
    const ui = await import('./ui.js');
    ui.buildChart();
    ui.bindUI();
    ui.render();
    flyToDay(0, false);
    state.map.once('idle', () => { if (state.current === 0) flyToDay(0, false); });

    buildRoute();
  });
}
