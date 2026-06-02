import { waypoints } from './data.js';
import state from './state.js';
import { modeBtn } from './dom.js';
import {
  bearingTo, clamp, destPoint, distanceKm, easeInOutCubic, lerp, lerpAngle
} from './helpers.js';
import { pointAtDist } from './route.js';

export const SMOOTH_RATE = 3;
export const TERRAIN_EXAG = 1.35;
const PITCH_LEVEL = 84;
const PITCH_LO = 72;
const PITCH_HI = 85;

export const MPH_STEPS = [2, 5, 15, 30, 60, 120, 300, 600];
export const STEP_MIN_MS = 3000;
export const DWELL_MS = 1600;

const SKY_NIGHT = { range: [0.5, 10], color: '#c9b98e', 'high-color': '#0a0a12', 'horizon-blend': 0.06, 'space-color': '#000000', 'star-intensity': 0.9 };
const SKY_DAY = { range: [0.5, 12], color: '#d7dde2', 'high-color': '#5b86c4', 'horizon-blend': 0.18, 'space-color': '#b9d2ec', 'star-intensity': 0.0 };

export function currentMph() { return MPH_STEPS[state.mphIdx]; }

export function mphDuration(km) {
  return (km / (currentMph() * 1.60934)) * 3600 * 1000;
}

export function loopPauseMs() { return mphDuration(10); }

export function tickSmooth(dt) {
  const tgt = currentMph();
  if (Math.abs(state.smoothMph - tgt) < 0.05) { state.smoothMph = tgt; return; }
  state.smoothMph += (tgt - state.smoothMph) * (1 - Math.exp(-SMOOTH_RATE * dt));
}

export function eyeMetresFor(mph) {
  return 6.54 * Math.pow(mph, 0.771) * 0.3048;
}

export function eyeMetres() { return eyeMetresFor(state.smoothMph); }

export function backKmFor(mph) {
  const t = clamp((eyeMetresFor(mph) - 4) / 300, 0, 1);
  return lerp(0.08, 1.6, t);
}

export function backKm() { return backKmFor(state.smoothMph); }

function topoPitch(fromLL, fromElev, toLL, toElev) {
  const distM = Math.max(1, distanceKm(fromLL, toLL) * 1000);
  const g0 = groundVisual(fromLL, fromElev);
  const g1 = groundVisual(toLL, toElev);
  const slopeDeg = Math.atan2(g1 - g0, distM) * 180 / Math.PI;
  const t = clamp(slopeDeg / 8, -1, 1);
  if (t >= 0) return lerp(PITCH_LEVEL, PITCH_HI, t);
  return lerp(PITCH_LEVEL, PITCH_LO, -t);
}

export function applySky() {
  document.body.classList.toggle('mode-night', state.isNight);
  document.body.classList.toggle('mode-day', !state.isNight);
  if (modeBtn) {
    modeBtn.textContent = state.isNight ? '☾' : '☀';
    modeBtn.setAttribute('aria-label', state.isNight ? 'Switch to day' : 'Switch to night');
  }
  if (state.map && state.map.setFog) state.map.setFog(state.isNight ? SKY_NIGHT : SKY_DAY);
}

export function toggleMode() { state.isNight = !state.isNight; applySky(); }

// Adjusts the target speed index and re-frames the camera so altitude tracks
// speed. During an active leg the path animation already eases altitude via
// smoothMph; in every other state (stopped, paused, or dwelling between legs)
// we run a dedicated reframe. The HUD speed label is refreshed by the caller
// (ui.js) so this stays free of any UI dependency.
export function changeSpeed(delta) {
  state.mphIdx = clamp(state.mphIdx + delta, 0, MPH_STEPS.length - 1);
  const activeLeg = state.playing && !state.paused;
  if (state.map && state.camView && !activeLeg) reframeForSpeed();
}

// Ease the camera to the altitude/framing for the current speed. Runs
// independently of the `paused` flag so a paused camera still responds.
function reframeForSpeed() {
  if (!state.map || !state.camView) return;
  if (state.camRAF) { cancelAnimationFrame(state.camRAF); state.camRAF = null; }
  const from = { ...state.camView };
  const dur = 800;
  let elapsed = 0;
  let lastT = performance.now();
  function frame(t) {
    const dt = (t - lastT) / 1000;
    elapsed += t - lastT;
    lastT = t;
    tickSmooth(dt);
    const target = computeView(state.current, currentMph());
    const k = clamp(elapsed / dur, 0, 1);
    const e = easeInOutCubic(k);
    const v = {
      lng: lerp(from.lng, target.lng, e), lat: lerp(from.lat, target.lat, e),
      alt: lerp(from.alt, target.alt, e), pitch: lerp(from.pitch, target.pitch, e),
      bearing: lerpAngle(from.bearing, target.bearing, e)
    };
    applyView(v);
    state.camView = v;
    if (k < 1) state.camRAF = requestAnimationFrame(frame);
    else state.camRAF = null;
  }
  state.camRAF = requestAnimationFrame(frame);
}

function groundVisual(lngLat, fallbackRealElev) {
  let e = state.map.queryTerrainElevation ? state.map.queryTerrainElevation(lngLat, { exaggerated: true }) : null;
  if (e == null || isNaN(e)) e = (fallbackRealElev || 0) * TERRAIN_EXAG;
  return e;
}

export function computeView(n, mph) {
  const w = waypoints[n];
  const next = waypoints[n + 1];
  const prev = waypoints[n - 1];
  let bearing = null;

  if (state.routeReady && state.dayIdx[n] != null) {
    const idx = state.dayIdx[n];
    const end = state.cumDist[state.cumDist.length - 1];
    const ahead = pointAtDist(clamp(state.cumDist[idx] + 1.0, 0, end));
    if (distanceKm(w.coords, [ahead[0], ahead[1]]) > 0.01) {
      bearing = bearingTo(w.coords, [ahead[0], ahead[1]]);
    }
  }
  if (bearing == null) {
    if (n === waypoints.length - 1) bearing = 345;
    else if (next && (next.coords[0] !== w.coords[0] || next.coords[1] !== w.coords[1])) {
      bearing = bearingTo(w.coords, next.coords);
    } else if (prev) bearing = bearingTo(prev.coords, w.coords);
    else bearing = 25;
  }
  const eye = mph ? eyeMetresFor(mph) : eyeMetres();
  const bk = mph ? backKmFor(mph) : backKm();
  const camLL = destPoint(w.coords, (bearing + 180) % 360, bk);
  let alt = groundVisual(camLL, w.elev) + eye;
  let maxAhead = -Infinity;
  const lookScale = clamp(eye / 60, 0.15, 1);
  for (const d of [0.6, 1.2, 2.0, 3.0]) {
    maxAhead = Math.max(maxAhead, groundVisual(destPoint(w.coords, bearing, d * lookScale), w.elev));
  }
  alt = Math.max(alt, maxAhead + eye * 0.4);
  const groundAlt = alt - eye;
  const pitch = topoPitch(camLL, w.elev, destPoint(w.coords, bearing, 1.0), w.elev);
  return { lng: camLL[0], lat: camLL[1], alt, pitch, bearing, _groundAlt: groundAlt };
}

function decayUserPan(dt) {
  if (state.userBearingOffset === 0 && state.userPitchOffset === 0) return;
  if (performance.now() - state.userPanTime < state.USER_PAN_IDLE) return;
  const d = 1 - Math.exp(-state.USER_PAN_RATE * dt);
  state.userBearingOffset *= (1 - d);
  state.userPitchOffset *= (1 - d);
  if (Math.abs(state.userBearingOffset) < 0.1) state.userBearingOffset = 0;
  if (Math.abs(state.userPitchOffset) < 0.1) state.userPitchOffset = 0;
}

export function applyView(v) {
  const opts = state.map.getFreeCameraOptions();
  opts.position = mapboxgl.MercatorCoordinate.fromLngLat([v.lng, v.lat], v.alt);
  const fp = clamp(v.pitch + state.userPitchOffset, 0, 85);
  opts.setPitchBearing(fp, v.bearing + state.userBearingOffset);
  state.map.setFreeCameraOptions(opts);
}

function ensureDecayLoop() {
  if (state._decayRAF || state.camRAF || state.orbitRAF) return;
  let lastT = performance.now();
  function tick(t) {
    const dt = (t - lastT) / 1000;
    lastT = t;
    decayUserPan(dt);
    if (state.userBearingOffset === 0 && state.userPitchOffset === 0) { state._decayRAF = null; return; }
    if (state.camView) applyView(state.camView);
    state._decayRAF = requestAnimationFrame(tick);
  }
  state._decayRAF = requestAnimationFrame(tick);
}

export function setupCameraDrag() {
  state.map.dragPan.disable();
  state.map.dragRotate.disable();
  state.map.scrollZoom.disable();
  state.map.doubleClickZoom.disable();
  state.map.boxZoom.disable();
  if (state.map.touchZoomRotate) state.map.touchZoomRotate.disable();
  if (state.map.touchPitch) state.map.touchPitch.disable();

  const canvas = state.map.getCanvas();
  function onDragStart(x, y) { state._dragActive = true; state._dragX = x; state._dragY = y; }
  function onDragMove(x, y) {
    if (!state._dragActive) return;
    const dx = x - state._dragX;
    const dy = y - state._dragY;
    state._dragX = x;
    state._dragY = y;
    state.userBearingOffset -= dx * 0.3;
    state.userPitchOffset = clamp(state.userPitchOffset - dy * 0.2, -90, 90);
    state.userPanTime = performance.now();
    if (state.camView) applyView(state.camView);
    ensureDecayLoop();
  }
  function onDragEnd() { state._dragActive = false; }

  canvas.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    onDragStart(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointermove', e => { if (state._dragActive) onDragMove(e.clientX, e.clientY); });
  canvas.addEventListener('pointerup', () => { onDragEnd(); });
  canvas.addEventListener('pointercancel', () => { onDragEnd(); });
}

export function flyToDay(n, animate = true) {
  if (!state.map || !state.map.getFreeCameraOptions) return 0;
  if (state.orbitRAF) { cancelAnimationFrame(state.orbitRAF); state.orbitRAF = null; }
  if (state.camRAF) { cancelAnimationFrame(state.camRAF); state.camRAF = null; }
  if (state._decayRAF) { cancelAnimationFrame(state._decayRAF); state._decayRAF = null; }

  const fromDay = state.lastDay;
  state.lastDay = n;
  const target = computeView(n, currentMph());
  const isLast = (n === waypoints.length - 1);

  if (!animate || !state.camView) {
    state.smoothMph = currentMph();
    applyView(target);
    state.camView = target;
    if (isLast) startOrbit(target);
    return 0;
  }

  const aIdx = state.dayIdx[fromDay];
  const bIdx = state.dayIdx[n];
  if (state.routeReady && aIdx != null && bIdx != null && aIdx !== bIdx) {
    const len = Math.abs(state.cumDist[bIdx] - state.cumDist[aIdx]);
    pathFollowAnim(aIdx, bIdx, len, target, () => { if (isLast) startOrbit(target); });
    return Math.max(2000, mphDuration(len));
  }

  const km = distanceKm(waypoints[fromDay].coords, waypoints[n].coords);
  const dur = aIdx === bIdx ? 1100 : Math.max(2000, mphDuration(km));
  viewLerpAnim({ ...state.camView }, target, dur, () => { if (isLast) startOrbit(target); });
  return dur;
}

function pathFollowAnim(aIdx, bIdx, totalKm, target, onEnd) {
  const dir = bIdx >= aIdx ? 1 : -1;
  const dA = state.cumDist[aIdx];
  const lo = Math.min(state.cumDist[aIdx], state.cumDist[bIdx]);
  const hi = Math.max(state.cumDist[aIdx], state.cumDist[bIdx]);
  const slopeKm = 0.4;
  const startView = { ...state.camView };
  let travelledKm = 0;
  let lastT = performance.now();
  let prevPitch = startView.pitch;
  let prevBearing = startView.bearing;

  function frame(t) {
    if (state.paused) { lastT = t; state.camRAF = requestAnimationFrame(frame); return; }
    const dt = (t - lastT) / 1000;
    lastT = t;
    decayUserPan(dt);
    tickSmooth(dt);
    travelledKm += (state.smoothMph * 1.60934 / 3600) * dt;
    const k = clamp(travelledKm / totalKm, 0, 1);
    const dist = dA + dir * k * totalKm;
    const p = pointAtDist(dist);
    const lookKm = clamp(totalKm * 0.05, 0.3, 1.5) * clamp(state.smoothMph / 30, 0.5, 3);
    const pa = pointAtDist(clamp(dist + dir * lookKm, lo, hi));
    const ps = pointAtDist(clamp(dist + dir * slopeKm, lo, hi));
    const bSmooth = 1 - Math.exp(-4 * dt);
    const pSmooth = 1 - Math.exp(-3 * dt);
    const rawBearing = (pa[0] === p[0] && pa[1] === p[1]) ? prevBearing : bearingTo([p[0], p[1]], [pa[0], pa[1]]);
    const bearing = lerpAngle(prevBearing, rawBearing, bSmooth);
    prevBearing = bearing;
    const alt = Math.max(groundVisual([p[0], p[1]], p[2]), groundVisual([pa[0], pa[1]], pa[2])) + eyeMetres();
    const rawPitch = topoPitch([p[0], p[1]], p[2], [ps[0], ps[1]], ps[2]);
    const pitch = lerp(prevPitch, rawPitch, pSmooth);
    prevPitch = pitch;
    let v = { lng: p[0], lat: p[1], alt, pitch, bearing };
    if (k < 0.12) {
      const b = k / 0.12;
      v.alt = lerp(startView.alt, v.alt, b);
      v.pitch = lerp(startView.pitch, v.pitch, b);
    }
    if (target && k > 0.8) {
      const b = easeInOutCubic((k - 0.8) / 0.2);
      const tAlt = (target._groundAlt != null) ? target._groundAlt + eyeMetres() : target.alt;
      v = {
        lng: lerp(v.lng, target.lng, b), lat: lerp(v.lat, target.lat, b),
        alt: lerp(v.alt, tAlt, b), pitch: lerp(v.pitch, target.pitch, b),
        bearing: lerpAngle(v.bearing, target.bearing, b)
      };
    }
    applyView(v);
    state.camView = v;
    if (k < 1) state.camRAF = requestAnimationFrame(frame);
    else {
      const fin = target ? { ...target, alt: (target._groundAlt != null) ? target._groundAlt + eyeMetres() : target.alt } : v;
      state.camView = fin;
      applyView(state.camView);
      if (onEnd) onEnd();
    }
  }
  state.camRAF = requestAnimationFrame(frame);
}

function viewLerpAnim(from, target, dur, onEnd) {
  let elapsed = 0;
  let lastT = performance.now();
  function frame(t) {
    if (state.paused) { lastT = t; state.camRAF = requestAnimationFrame(frame); return; }
    const dtS = (t - lastT) / 1000;
    elapsed += t - lastT;
    lastT = t;
    decayUserPan(dtS);
    tickSmooth(dtS);
    const k = clamp(elapsed / dur, 0, 1);
    const e = easeInOutCubic(k);
    const v = {
      lng: lerp(from.lng, target.lng, e), lat: lerp(from.lat, target.lat, e),
      alt: lerp(from.alt, target.alt, e), pitch: lerp(from.pitch, target.pitch, e),
      bearing: lerpAngle(from.bearing, target.bearing, e)
    };
    applyView(v);
    state.camView = v;
    if (k < 1) state.camRAF = requestAnimationFrame(frame);
    else { state.camView = target; if (onEnd) onEnd(); }
  }
  state.camRAF = requestAnimationFrame(frame);
}

function startOrbit(view) {
  const pivot = destPoint([view.lng, view.lat], view.bearing, 4);
  const radiusKm = distanceKm([view.lng, view.lat], pivot);
  const startBrng = (view.bearing + 180) % 360;
  const span = Math.max(6000, mphDuration(5));
  const sweep = 30;
  let elapsed = 0;
  let lastT = performance.now();
  function frame(t) {
    if (state.paused) { lastT = t; state.orbitRAF = requestAnimationFrame(frame); return; }
    const dtS = (t - lastT) / 1000;
    elapsed += t - lastT;
    lastT = t;
    decayUserPan(dtS);
    tickSmooth(dtS);
    const k = clamp(elapsed / span, 0, 1);
    const e = easeInOutCubic(k);
    const b = startBrng + sweep * e;
    const camLL = destPoint(pivot, b, radiusKm);
    applyView({ lng: camLL[0], lat: camLL[1], alt: view.alt, pitch: view.pitch, bearing: (b + 180) % 360 });
    if (k < 1) state.orbitRAF = requestAnimationFrame(frame);
  }
  state.orbitRAF = requestAnimationFrame(frame);
}
