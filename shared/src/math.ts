/**
 * Pequenos utilitarios matematicos compartilhados entre servidor (simulacao
 * autoritativa) e cliente (render/predicao). Mantido sem dependencias para
 * poder rodar em qualquer runtime.
 */

export const TAU = Math.PI * 2;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function invLerp(a: number, b: number, v: number): number {
  if (a === b) return 0;
  return clamp01((v - a) / (b - a));
}

/** Interpolacao independente de framerate (dt em segundos). */
export function damp(current: number, target: number, smoothing: number, dt: number): number {
  return lerp(current, target, 1 - Math.pow(smoothing, dt * 60));
}

export function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % TAU) - Math.PI;
  if (diff < -Math.PI) diff += TAU;
  return a + diff * t;
}

export function len(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return len(bx - ax, by - ay);
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function normalize(x: number, y: number): { x: number; y: number } {
  const l = len(x, y);
  if (l < 1e-6) return { x: 0, y: 0 };
  return { x: x / l, y: y / l };
}

/** Limita um vetor a magnitude 1 (mantendo analogico em valores menores). */
export function clampVector(x: number, y: number): { x: number; y: number } {
  const l = len(x, y);
  if (l <= 1) return { x, y };
  return { x: x / l, y: y / l };
}

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function smoothstep(edge0: number, edge1: number, v: number): number {
  const t = invLerp(edge0, edge1, v);
  return t * t * (3 - 2 * t);
}

export function easeOutCubic(t: number): number {
  const p = 1 - clamp01(t);
  return 1 - p * p * p;
}

export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const p = clamp01(t) - 1;
  return 1 + c3 * p * p * p + c1 * p * p;
}

export function easeInOutQuad(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

/** Formata segundos como 0:07 / 1:23. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${rest.toString().padStart(2, '0')}`;
}
