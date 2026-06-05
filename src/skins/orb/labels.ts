import type { Friend } from '../../user';

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
