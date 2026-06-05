import type { Friend } from './user';

export const DEV_FRIENDS: Friend[] = import.meta.env.DEV
  ? [
    { id: 0, name: 'Alex',   avatarUrl: null, density: 0.9,  bearing: 0,   colorIdx: 0, active: true },
    { id: 1, name: 'Sam',    avatarUrl: null, density: 0.4,  bearing: 36,  colorIdx: 1, active: true },
    { id: 2, name: 'Jordan', avatarUrl: null, density: 0.7,  bearing: 72,  colorIdx: 2, active: true },
    { id: 3, name: 'Taylor', avatarUrl: null, density: 0.2,  bearing: 108, colorIdx: 3, active: true },
    { id: 4, name: 'Morgan', avatarUrl: null, density: 0.6,  bearing: 144, colorIdx: 4, active: true },
    { id: 5, name: 'Riley',  avatarUrl: null, density: 0.15, bearing: 180, colorIdx: 5, active: true },
    { id: 6, name: 'Casey',  avatarUrl: null, density: 0.85, bearing: 216, colorIdx: 6, active: true },
    { id: 7, name: 'Drew',   avatarUrl: null, density: 0.5,  bearing: 252, colorIdx: 7, active: true },
    { id: 8, name: 'Quinn',  avatarUrl: null, density: 0.3,  bearing: 288, colorIdx: 8, active: true },
    { id: 9, name: 'Avery',  avatarUrl: null, density: 0.75, bearing: 324, colorIdx: 9, active: true },
  ]
  : [];

export const friends: Friend[] = [...DEV_FRIENDS];

export function resetDevFriends(): void {
  friends.length = 0;
  friends.push(...DEV_FRIENDS.map(f => ({ ...f })));
}
