// Adaptive quality for low-end machines (integrated GPUs, software WebGL).
// Perf mode keeps every feature but renders cheaper frames: lower render
// resolution, tighter fog (far fewer horizon tiles at high pitch), and a
// slightly flatter flythrough pitch. It turns on up front via hardware
// heuristics, or automatically when measured FPS stays low, and the choice
// is remembered in localStorage ('1' = on, '0' = off; delete to re-detect).
import state from './state.js';
import { toast } from './helpers.js';
import { applySky } from './camera.js';

const KEY = 'k2PerfMode';

function looksLowEnd() {
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) return true;
  if (navigator.deviceMemory && navigator.deviceMemory <= 4) return true;
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
      || document.createElement('canvas').getContext('webgl');
    if (!gl) return true;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : '';
    if (/swiftshader|llvmpipe|software|basic render/i.test(renderer)) return true;
    if (/intel(\(r\))?\s+(hd|uhd)\s+graphics/i.test(renderer)) return true;
  } catch (e) { /* detection is best-effort */ }
  return false;
}

// Cap the render resolution by clamping devicePixelRatio *before* the map is
// created. GL JS v3.7 ignores the Map `pixelRatio` option for the live canvas,
// but it reads window.devicePixelRatio at creation (and on resize), so this is
// the version-proof lever. Full DPR on a hi-DPI panel means 4x the pixels.
function clampPixelRatio() {
  const cap = state.perfMode ? 1 : 1.5;
  const real = window.devicePixelRatio || 1;
  const val = Math.min(real, cap);
  if (val >= real) return;
  try {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => val });
  } catch (e) { /* some environments disallow redefining it */ }
}

export function initPerf() {
  let stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
  state.perfMode = stored != null ? stored === '1' : looksLowEnd();
  clampPixelRatio();
}

export function enablePerfMode(announce) {
  if (state.perfMode) return;
  state.perfMode = true;
  try { localStorage.setItem(KEY, '1'); } catch (e) { /* private mode */ }
  // Fog/pitch apply immediately; drop the render resolution too and resize so
  // GL JS re-reads the now-lower devicePixelRatio.
  clampPixelRatio();
  if (state.map) { applySky(); if (state.map.resize) state.map.resize(); }
  if (announce) toast('Performance mode on — lighter rendering for this machine');
}

// Watch real frame cadence after the map settles. Two consecutive slow
// 4-second windows flip perf mode on. An idle map still ticks rAF at full
// refresh rate, so quiet periods can't produce false positives.
export function startFpsMonitor() {
  if (state.perfMode) return;
  const WINDOW_MS = 4000;
  const MIN_FPS = 24;
  const GIVE_UP_MS = 180000;
  const t0 = performance.now();
  let frames = 0;
  let winStart = t0;
  let slowWindows = 0;
  function tick(t) {
    if (document.hidden || t - winStart > WINDOW_MS * 2) {
      // Tab was backgrounded or rAF suspended; discard this window.
      frames = 0;
      winStart = t;
    } else {
      frames++;
      if (t - winStart >= WINDOW_MS) {
        const fps = frames / ((t - winStart) / 1000);
        slowWindows = fps < MIN_FPS ? slowWindows + 1 : 0;
        if (slowWindows >= 2) { enablePerfMode(true); return; }
        frames = 0;
        winStart = t;
      }
    }
    if (t - t0 < GIVE_UP_MS) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
