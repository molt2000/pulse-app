import type { ViewportSize } from '../../user';

const ORB_REACH        = 0.76;
const VERTICAL_SQUEEZE = 0.72;

export function friendScreenPosition(bearing: number, viewport: ViewportSize): { x: number; y: number } {
  const cx = viewport.width  / 2;
  const cy = viewport.height / 2;
  const dx =  Math.sin((bearing * Math.PI) / 180);
  const dy = -Math.cos((bearing * Math.PI) / 180);
  let t = Number.POSITIVE_INFINITY;
  if (dx >  1e-6) t = Math.min(t, (viewport.width  - cx) / dx);
  if (dx < -1e-6) t = Math.min(t, (0 - cx)          / dx);
  if (dy >  1e-6) t = Math.min(t, (viewport.height - cy) / dy);
  if (dy < -1e-6) t = Math.min(t, (0 - cy)          / dy);
  return {
    x: cx + dx * t * ORB_REACH,
    y: cy + dy * t * ORB_REACH * VERTICAL_SQUEEZE,
  };
}

export function softGravityPull(meters: number): number {
  if (meters >= 150) return 0;
  if (meters <= 0)   return 0.28;
  if (meters > 100) {
    const t = 1 - (meters - 100) / 50;
    return smoothstep(t) * 0.08;
  }
  const t = 1 - meters / 100;
  return 0.08 + smoothstep(t) * 0.20;
}

export function proximityMeters(density: number): number {
  return Math.round((1 - Math.max(0, Math.min(1, density))) * 500);
}

export function smoothstep(value: number): number {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
}
