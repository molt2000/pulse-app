export interface Friend {
  id: number;
  name: string;
  density: number;
  bearing: number;
  colorIdx: number;
  active: boolean;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export const friends: Friend[] = [
  { id: 0, name: 'Alex', density: 0.9, bearing: 0, colorIdx: 0, active: true },
  { id: 1, name: 'Sam', density: 0.4, bearing: 36, colorIdx: 1, active: true },
  { id: 2, name: 'Jordan', density: 0.7, bearing: 72, colorIdx: 2, active: true },
  { id: 3, name: 'Taylor', density: 0.2, bearing: 108, colorIdx: 3, active: true },
  { id: 4, name: 'Morgan', density: 0.6, bearing: 144, colorIdx: 4, active: true },
  { id: 5, name: 'Riley', density: 0.15, bearing: 180, colorIdx: 5, active: true },
  { id: 6, name: 'Casey', density: 0.85, bearing: 216, colorIdx: 6, active: true },
  { id: 7, name: 'Drew', density: 0.5, bearing: 252, colorIdx: 7, active: true },
  { id: 8, name: 'Quinn', density: 0.3, bearing: 288, colorIdx: 8, active: true },
  { id: 9, name: 'Avery', density: 0.75, bearing: 324, colorIdx: 9, active: true },
];

const ORB_REACH = 0.76;

export function friendScreenPosition(bearing: number, viewport: ViewportSize): { x: number; y: number } {
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  const dx = Math.sin((bearing * Math.PI) / 180);
  const dy = -Math.cos((bearing * Math.PI) / 180);
  let t = Number.POSITIVE_INFINITY;

  if (dx > 1e-6) t = Math.min(t, (viewport.width - cx) / dx);
  if (dx < -1e-6) t = Math.min(t, (0 - cx) / dx);
  if (dy > 1e-6) t = Math.min(t, (viewport.height - cy) / dy);
  if (dy < -1e-6) t = Math.min(t, (0 - cy) / dy);

  return {
    x: cx + dx * t * ORB_REACH,
    y: cy + dy * t * ORB_REACH,
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

export function friendMeta(friend: Friend): string {
  if (friend.density >= 0.78) return 'nearby';
  if (friend.density >= 0.48) return 'moving';
  return 'quiet';
}
