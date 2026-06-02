import { toastEl } from './dom.js';

export const fmt = n => n.toLocaleString('en-US');
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const pad2 = n => String(n).padStart(2, '0');
export const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const lerp = (a, b, t) => a + (b - a) * t;

export function lerpAngle(a, b, t) {
  const d = ((b - a + 540) % 360) - 180;
  return a + d * t;
}

export function bearingTo(a, b) {
  const toR = d => d * Math.PI / 180;
  const toD = r => r * 180 / Math.PI;
  const y = Math.sin(toR(b[0] - a[0])) * Math.cos(toR(b[1]));
  const x = Math.cos(toR(a[1])) * Math.sin(toR(b[1])) - Math.sin(toR(a[1])) * Math.cos(toR(b[1])) * Math.cos(toR(b[0] - a[0]));
  return (toD(Math.atan2(y, x)) + 360) % 360;
}

export function distanceKm(a, b) {
  const toR = d => d * Math.PI / 180;
  const R = 6371;
  const dLat = toR(b[1] - a[1]);
  const dLng = toR(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a[1])) * Math.cos(toR(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export const lineFeature = coords => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } });

export function destPoint(p, brngDeg, dKm) {
  const R = 6371;
  const toR = d => d * Math.PI / 180;
  const toD = r => r * 180 / Math.PI;
  const d = dKm / R;
  const th = toR(brngDeg);
  const f1 = toR(p[1]);
  const l1 = toR(p[0]);
  const f2 = Math.asin(Math.sin(f1) * Math.cos(d) + Math.cos(f1) * Math.sin(d) * Math.cos(th));
  const l2 = l1 + Math.atan2(Math.sin(th) * Math.sin(d) * Math.cos(f1), Math.cos(d) - Math.sin(f1) * Math.sin(f2));
  return [toD(l2), toD(f2)];
}

export function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 4200);
}
