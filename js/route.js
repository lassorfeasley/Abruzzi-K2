import { MAPBOX_TOKEN } from './config.js';
import { waypoints, glacierCoords, GLACIER_AT } from './data.js';
import state from './state.js';
import { loadingEl } from './dom.js';
import { clamp, distanceKm, lerp, lineFeature, toast } from './helpers.js';

export function buildRouteMetrics() {
  state.cumDist = new Array(state.fullCoords.length);
  state.cumDist[0] = 0;
  for (let i = 1; i < state.fullCoords.length; i++) {
    state.cumDist[i] = state.cumDist[i - 1] + distanceKm(state.fullCoords[i - 1], state.fullCoords[i]);
  }
  state.elevAt = new Array(state.fullCoords.length).fill(waypoints[0].elev);
  for (let d = 0; d < waypoints.length - 1; d++) {
    const a = state.dayIdx[d];
    const b = state.dayIdx[d + 1];
    if (a == null || b == null) continue;
    if (b <= a) { state.elevAt[a] = waypoints[d].elev; continue; }
    for (let i = a; i <= b; i++) {
      state.elevAt[i] = lerp(waypoints[d].elev, waypoints[d + 1].elev, (i - a) / (b - a));
    }
  }
  const lastIdx = state.dayIdx[waypoints.length - 1] ?? state.fullCoords.length - 1;
  for (let i = lastIdx; i < state.fullCoords.length; i++) {
    state.elevAt[i] = waypoints[waypoints.length - 1].elev;
  }
}

export function pointAtDist(dist) {
  const N = state.fullCoords.length;
  dist = clamp(dist, 0, state.cumDist[N - 1]);
  let lo = 0;
  let hi = N - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (state.cumDist[m] < dist) lo = m + 1;
    else hi = m;
  }
  const i = Math.max(1, lo);
  const seg = state.cumDist[i] - state.cumDist[i - 1];
  const f = seg > 1e-9 ? (dist - state.cumDist[i - 1]) / seg : 0;
  const a = state.fullCoords[i - 1];
  const b = state.fullCoords[i];
  return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(state.elevAt[i - 1], state.elevAt[i], f)];
}

async function fetchRoadSegment(a, b) {
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${a[0]},${a[1]};${b[0]},${b[1]}`
    + `?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
  try {
    const r = await fetch(url);
    const j = await r.json();
    const rt = j.routes && j.routes[0];
    if (rt && rt.geometry) {
      const crow = distanceKm(a, b);
      const road = (rt.distance || 0) / 1000;
      if (crow > 5 && road > crow * 6) {
        console.warn('Directions detour too long; using straight line.', { crow, road }, a, b);
        return { coords: [a, b], ok: false };
      }
      return { coords: rt.geometry.coordinates, ok: true };
    }
    throw new Error('no route in response');
  } catch (err) {
    console.warn('Directions API failed for segment; using straight line.', a, b, err);
    return { coords: [a, b], ok: false };
  }
}

export function addRouteLayers() {
  const empty = lineFeature([]);
  state.map.addSource('route-future', { type: 'geojson', data: lineFeature(state.fullCoords) });
  state.map.addSource('route-glow', { type: 'geojson', data: empty });
  state.map.addSource('route', { type: 'geojson', data: empty });

  state.map.addLayer({
    id: 'route-future', type: 'line', source: 'route-future',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#8b6914', 'line-width': 1, 'line-opacity': 0.2 }
  });
  state.map.addLayer({
    id: 'route-glow', type: 'line', source: 'route-glow',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#c9a84c', 'line-width': 6, 'line-opacity': 0.25, 'line-blur': 4 }
  });
  state.map.addLayer({
    id: 'route', type: 'line', source: 'route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#c9a84c', 'line-width': 2.5, 'line-dasharray': [2, 1.5], 'line-opacity': 0.95 }
  });
}

export function drawRoute() {
  if (!state.routeReady || !state.map || !state.map.getSource('route')) return;
  const end = state.dayIdx[state.current] ?? 0;
  const drawn = state.fullCoords.slice(0, end + 1);
  state.map.getSource('route').setData(lineFeature(drawn));
  state.map.getSource('route-glow').setData(lineFeature(drawn));
}

export async function buildRoute() {
  loadingEl.classList.add('show');
  let usedFallback = false;
  let coords = [waypoints[0].coords.slice()];
  state.dayIdx[0] = 0;

  for (let i = 0; i < 11; i++) {
    const seg = await fetchRoadSegment(waypoints[i].coords, waypoints[i + 1].coords);
    if (!seg.ok) usedFallback = true;
    coords = coords.concat(seg.coords.slice(1));
    state.dayIdx[i + 1] = coords.length - 1;
  }
  state.dayIdx[12] = state.dayIdx[11];
  state.dayIdx[13] = state.dayIdx[11];

  const bridge = await fetchRoadSegment(waypoints[13].coords, glacierCoords[0]);
  if (!bridge.ok) usedFallback = true;
  coords = coords.concat(bridge.coords.slice(1));

  const gStart = coords.length - 1;
  coords = coords.concat(glacierCoords.slice(1).map(c => c.slice()));
  for (const k in GLACIER_AT) state.dayIdx[+k] = gStart + GLACIER_AT[k];

  state.fullCoords = coords;
  buildRouteMetrics();
  state.routeReady = true;

  addRouteLayers();
  drawRoute();

  loadingEl.classList.remove('show');
  if (usedFallback) toast('Some road segments approximated');

  const ui = await import('./ui.js');
  ui.buildProgressUI();
  setTimeout(ui.autostart, 1400);
}
