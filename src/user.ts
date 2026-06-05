export interface Friend {
  id: number;
  name: string;
  avatarUrl?: string | null;
  density: number;
  bearing: number;
  colorIdx: number;
  active: boolean;
}

export interface ViewportSize { width: number; height: number; }

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

export function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function friendDistanceLabel(friend: Friend): string {
  const proximity = Math.max(0, Math.min(1, friend.density));
  const meters    = Math.round((1 - proximity) * 500);
  if (meters >= 500) return '>500 m';
  if (meters <= 0)   return '0 m';
  if (meters >= 100) return `${Math.round(meters / 10) * 10} m`;
  return `${meters} m`;
}
