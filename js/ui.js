import { waypoints } from './data.js';
import state from './state.js';
import {
  $, dayCounter, locName, elevEl, descEl, banner,
  progressWrap, progressFill, progressThumb, progressTicks, progressLabels,
  prevBtn, nextBtn, playBtn, slowBtn, fastBtn, speedLabel, modeBtn
} from './dom.js';
import { fmt, pad2, clamp } from './helpers.js';
import {
  flyToDay, changeSpeed, toggleMode, currentMph,
  MPH_STEPS, STEP_MIN_MS, DWELL_MS, loopPauseMs
} from './camera.js';
import { drawRoute } from './route.js';
import { updateMarkers } from './map.js';

const CW = 280;
const CH = 118;
const PADL = 6;
const PADR = 6;
const PADT = 20;
const PADB = 12;
const elevs = waypoints.map(w => w.elev);
const minE = Math.min(...elevs);
const maxE = Math.max(...elevs);
const xAt = i => PADL + (i / (waypoints.length - 1)) * (CW - PADL - PADR);
const yAt = e => (CH - PADB) - ((e - minE) / (maxE - minE)) * (CH - PADT - PADB);
const jit = i => (Math.sin(i * 12.9898) * 43758.5453 % 1) * 1.2;
const PEAKS = [{ i: 4, t: 'Zoji La' }, { i: 11, t: 'Skardu' }, { i: 17, t: 'Askole' }, { i: 26, t: 'Concordia' }, { i: 28, t: 'BC' }];

export function buildChart() {
  const svg = $('elevChart');
  const ns = 'http://www.w3.org/2000/svg';
  if (!svg) return;
  const pts = waypoints.map((w, i) => [xAt(i), yAt(w.elev) + jit(i)]);

  let dArea = `M ${pts[0][0]} ${CH - PADB} `;
  pts.forEach(p => { dArea += `L ${p[0].toFixed(1)} ${p[1].toFixed(1)} `; });
  dArea += `L ${pts[pts.length - 1][0]} ${CH - PADB} Z`;
  const area = document.createElementNS(ns, 'path');
  area.setAttribute('d', dArea);
  area.setAttribute('fill', 'rgba(139,58,42,0.15)');
  svg.appendChild(area);

  let dLine = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)} `;
  pts.forEach(p => { dLine += `L ${p[0].toFixed(1)} ${p[1].toFixed(1)} `; });
  const line = document.createElementNS(ns, 'path');
  line.setAttribute('d', dLine);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', '#8b3a2a');
  line.setAttribute('stroke-width', '1');
  line.setAttribute('stroke-linejoin', 'round');
  line.setAttribute('stroke-linecap', 'round');
  svg.appendChild(line);

  PEAKS.forEach(p => {
    const tick = document.createElementNS(ns, 'line');
    const x = xAt(p.i);
    tick.setAttribute('x1', x);
    tick.setAttribute('x2', x);
    tick.setAttribute('y1', PADT - 3);
    tick.setAttribute('y2', yAt(waypoints[p.i].elev) + jit(p.i));
    tick.setAttribute('stroke', 'rgba(90,70,50,.35)');
    tick.setAttribute('stroke-width', '.6');
    tick.setAttribute('stroke-dasharray', '2 2');
    svg.appendChild(tick);
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', x);
    t.setAttribute('y', PADT - 7);
    t.setAttribute('text-anchor', p.i >= 24 ? 'end' : 'middle');
    t.setAttribute('font-family', 'EB Garamond,serif');
    t.setAttribute('font-size', '8.5');
    t.setAttribute('fill', '#5a4632');
    t.textContent = p.t;
    svg.appendChild(t);
  });

  const ind = document.createElementNS(ns, 'line');
  ind.setAttribute('id', 'chartIndicator');
  ind.setAttribute('y1', PADT - 3);
  ind.setAttribute('y2', CH - PADB);
  ind.setAttribute('stroke', '#2c1a0e');
  ind.setAttribute('stroke-width', '1.1');
  ind.setAttribute('stroke-dasharray', '3 2');
  svg.appendChild(ind);
  const dot = document.createElementNS(ns, 'circle');
  dot.setAttribute('id', 'chartDot');
  dot.setAttribute('r', '3.2');
  dot.setAttribute('fill', '#c9a84c');
  dot.setAttribute('stroke', '#2c1a0e');
  dot.setAttribute('stroke-width', '1');
  svg.appendChild(dot);
}

function updateChartIndicator() {
  const x = xAt(state.current);
  const y = yAt(waypoints[state.current].elev) + jit(state.current);
  const ind = $('chartIndicator');
  const dot = $('chartDot');
  if (ind) { ind.setAttribute('x1', x); ind.setAttribute('x2', x); }
  if (dot) { dot.setAttribute('cx', x); dot.setAttribute('cy', y); }
}

export function render() {
  const w = waypoints[state.current];
  dayCounter.textContent = `Day ${pad2(w.day)} / 29`;
  locName.textContent = w.name;
  elevEl.textContent = `${fmt(w.elev)} m`;
  descEl.textContent = w.desc;

  updateProgress(state.current);
  prevBtn.disabled = (state.current === 0);
  nextBtn.disabled = (state.current === waypoints.length - 1);
  banner.classList.toggle('show', state.current === waypoints.length - 1);

  updateMarkers();
  drawRoute();
  updateChartIndicator();
}

export function buildProgressUI() {
  const N = waypoints.length;
  for (let i = 0; i < N; i++) {
    const tick = document.createElement('div');
    tick.className = 'progress-tick' + (i % 5 === 0 ? ' major' : '');
    tick.style.left = (i / (N - 1)) * 100 + '%';
    progressTicks.appendChild(tick);
  }
  const show = [0];
  for (let i = 4; i < N - 1; i += 5) show.push(i);
  if (show[show.length - 1] !== N - 1) show.push(N - 1);
  for (let i = 0; i < N; i++) {
    const s = document.createElement('span');
    if (show.includes(i)) s.textContent = (i + 1);
    s.dataset.idx = i;
    progressLabels.appendChild(s);
  }
}

function updateProgress(n) {
  const pct = (n / (waypoints.length - 1)) * 100;
  progressFill.style.width = pct + '%';
  progressThumb.style.left = pct + '%';
  progressLabels.querySelectorAll('span').forEach((s, i) => {
    s.classList.toggle('active', i === n);
  });
}

function setupProgressSeek() {
  function seek(e) {
    const rect = progressWrap.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const n = Math.round(x * (waypoints.length - 1));
    stopPlay();
    goToDay(n);
  }
  let dragging = false;
  progressWrap.addEventListener('pointerdown', e => {
    dragging = true;
    progressWrap.setPointerCapture(e.pointerId);
    seek(e);
  });
  progressWrap.addEventListener('pointermove', e => { if (dragging) seek(e); });
  progressWrap.addEventListener('pointerup', () => { dragging = false; });
}

export function goToDay(n, fly = true) {
  n = clamp(n, 0, waypoints.length - 1);
  state.current = n;
  render();
  let dur = 0;
  if (fly) dur = flyToDay(n, true);
  return dur;
}

export function nextDay() {
  return (state.current < waypoints.length - 1) ? goToDay(state.current + 1) : 0;
}

export function prevDay() {
  if (state.current > 0) goToDay(state.current - 1);
}

export function startPlay() {
  if (state.current === waypoints.length - 1) goToDay(0);
  state.playing = true;
  state.paused = false;
  playBtn.querySelector('.ico').textContent = '⏸';
  playBtn.lastChild.textContent = ' Pause';
  playBtn.classList.add('active');
  scheduleStep(state.current === 0 ? 1200 : 400);
}

function scheduleStep(delay) {
  state.playTimer = setTimeout(() => {
    if (!state.playing) return;
    if (state.current >= waypoints.length - 1) {
      state.playTimer = setTimeout(() => {
        if (!state.playing) return;
        goToDay(0);
        scheduleStep(2200);
      }, loopPauseMs());
      return;
    }
    const dur = nextDay();
    scheduleStep((dur || STEP_MIN_MS) + DWELL_MS);
  }, delay);
}

export function stopPlay() {
  state.playing = false;
  state.paused = false;
  playBtn.querySelector('.ico').textContent = '▶';
  playBtn.lastChild.textContent = ' Play';
  playBtn.classList.remove('active');
  if (state.playTimer) { clearTimeout(state.playTimer); state.playTimer = null; }
}

function togglePlay() {
  if (state.playing && !state.paused) {
    state.paused = true;
    if (state.playTimer) { clearTimeout(state.playTimer); state.playTimer = null; }
    playBtn.querySelector('.ico').textContent = '▶';
    playBtn.lastChild.textContent = ' Play';
    playBtn.classList.remove('active');
  } else if (state.playing && state.paused) {
    state.paused = false;
    playBtn.querySelector('.ico').textContent = '⏸';
    playBtn.lastChild.textContent = ' Pause';
    playBtn.classList.add('active');
    scheduleStep(800);
  } else {
    startPlay();
  }
}

const UI_TIMEOUT = 4000;

function showUI() {
  document.body.classList.add('ui-active');
  clearTimeout(state.uiHideTimer);
  state.uiHideTimer = setTimeout(() => document.body.classList.remove('ui-active'), UI_TIMEOUT);
}

function keepUI() {
  document.body.classList.add('ui-active');
  clearTimeout(state.uiHideTimer);
}

function setupAmbientUI() {
  ['mousemove', 'pointerdown', 'touchstart', 'wheel'].forEach(ev =>
    window.addEventListener(ev, showUI, { passive: true }));
  const hud = $('hud');
  if (hud) {
    hud.addEventListener('pointerenter', keepUI);
    hud.addEventListener('pointerleave', showUI);
    hud.addEventListener('click', () => { keepUI(); setTimeout(showUI, 600); });
  }
}

export function updateSpeedUI() {
  if (speedLabel) speedLabel.textContent = currentMph() + ' mph';
  if (slowBtn) slowBtn.disabled = (state.mphIdx === 0);
  if (fastBtn) fastBtn.disabled = (state.mphIdx === MPH_STEPS.length - 1);
}

function adjustSpeed(delta) {
  changeSpeed(delta);
  updateSpeedUI();
}

export function bindUI() {
  prevBtn.addEventListener('click', () => { stopPlay(); prevDay(); });
  nextBtn.addEventListener('click', () => { stopPlay(); nextDay(); });
  playBtn.addEventListener('click', togglePlay);
  if (slowBtn) slowBtn.addEventListener('click', () => adjustSpeed(-1));
  if (fastBtn) fastBtn.addEventListener('click', () => adjustSpeed(+1));
  if (modeBtn) modeBtn.addEventListener('click', toggleMode);
  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { stopPlay(); nextDay(); }
    else if (e.key === 'ArrowLeft') { stopPlay(); prevDay(); }
    else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    else if (e.key === '+' || e.key === '=') adjustSpeed(+1);
    else if (e.key === '-' || e.key === '_') adjustSpeed(-1);
    else if (e.key === 'n' || e.key === 'N' || e.key === 'd' || e.key === 'D') toggleMode();
  });
  updateSpeedUI();
  setupAmbientUI();
  setupProgressSeek();
}

export function autostart() {
  if (state.playing) return;
  if (state.current !== 0) goToDay(0);
  startPlay();
}
