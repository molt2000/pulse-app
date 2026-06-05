# Pulse Folder Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize `src/` to match the target folder structure without changing any runtime behavior.

**Architecture:** Pure file moves and renames, plus (a) extracting `services/presence.ts` from `MainScreen.ts`, (b) splitting `visuals/renderer.ts` into focused `skins/orb/` modules, and (c) splitting `state.ts` into `user.ts` + `devMode.ts`. No logic changes in any function body.

**Tech Stack:** TypeScript 5, Vite, Supabase, WebGL

---

## Import graph (current → affected by which task)

```
main.ts              → Task 5 (becomes app.ts)
screens/PermissionScreen.ts  → Task 5
screens/LobbyScreen.ts       → Task 2, 4, 5
screens/MainScreen.ts        → Task 1, 2, 3, 4, 5
visuals/renderer.ts          → Task 3, 4
visuals/lobbyBackground.ts   → Task 4
auth.ts                      → Task 2
supabase.ts                  → Task 2
state.ts                     → Task 3, 4
proximity.ts                 → Task 1
hooks/useCompass.ts          → Task 1
visuals/shaders.ts           → Task 4
visuals/theme.ts             → Task 4
```

---

## Task 1: core/

Move earth-math and compass to `core/`.

**Files:**
- Create: `src/core/geo.ts`
- Create: `src/core/compass.ts`
- Modify: `src/screens/MainScreen.ts` (2 import lines)
- Delete: `src/proximity.ts`, `src/hooks/useCompass.ts`

- [ ] **Step 1: Create `src/core/geo.ts`**

Exact copy of `src/proximity.ts` — no edits to any function body:

```ts
export function distanceMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function densityFromDistance(meters: number): number {
  return Math.max(0, Math.min(1, 1 - meters / 500));
}

export function bearingDegrees(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const lat1r = (lat1 * Math.PI) / 180;
  const lat2r = (lat2 * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2r);
  const x =
    Math.cos(lat1r) * Math.sin(lat2r) -
    Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function colorIdxFromUserId(userId: string): number {
  let hash = 0;
  for (const c of userId) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return Math.abs(hash) % 10;
}

export function stableIdFromUserId(userId: string): number {
  let hash = 0;
  for (const c of userId) hash = (hash * 2654435761 + c.charCodeAt(0)) >>> 0;
  return hash;
}
```

- [ ] **Step 2: Create `src/core/compass.ts`**

Exact copy of `src/hooks/useCompass.ts` — no edits to any function body:

```ts
const ALPHA = 0.12;

type HeadingCb = (heading: number) => void;

export class CompassManager {
  private _heading  = 0;
  private _active   = false;
  private sinAcc    = 0;
  private cosAcc    = 0;
  private hasFirst  = false;
  private gotAbs    = false;
  private readonly subs = new Set<HeadingCb>();

  readonly supported = 'DeviceOrientationEvent' in window;

  get heading(): number  { return this._heading; }
  get active():  boolean { return this._active; }

  get needsPermission(): boolean {
    return typeof (DeviceOrientationEvent as any).requestPermission === 'function';
  }

  async enable(): Promise<boolean> {
    if (!this.supported) return false;
    if (this._active)    return true;

    if (this.needsPermission) {
      try {
        const result = await (DeviceOrientationEvent as any).requestPermission();
        if (result !== 'granted') return false;
      } catch {
        return false;
      }
    }

    window.addEventListener('deviceorientationabsolute', this.onEvent as EventListener, true);
    window.addEventListener('deviceorientation',         this.onEvent,                   true);
    this._active = true;
    return true;
  }

  disable(): void {
    window.removeEventListener('deviceorientationabsolute', this.onEvent as EventListener, true);
    window.removeEventListener('deviceorientation',         this.onEvent,                   true);
    this._active  = false;
    this.hasFirst = false;
    this.gotAbs   = false;
  }

  subscribe(cb: HeadingCb): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  private readonly onEvent = (e: DeviceOrientationEvent): void => {
    if ((e as Event).type === 'deviceorientationabsolute') {
      this.gotAbs = true;
    } else if (this.gotAbs) {
      return;
    }

    const raw: number | null =
      typeof (e as any).webkitCompassHeading === 'number'
        ? (e as any).webkitCompassHeading
        : e.alpha !== null
          ? (360 - e.alpha) % 360
          : null;

    if (raw === null) return;

    const rad = (raw * Math.PI) / 180;
    if (!this.hasFirst) {
      this.sinAcc   = Math.sin(rad);
      this.cosAcc   = Math.cos(rad);
      this.hasFirst = true;
    } else {
      this.sinAcc += (Math.sin(rad) - this.sinAcc) * ALPHA;
      this.cosAcc += (Math.cos(rad) - this.cosAcc) * ALPHA;
    }

    this._heading = ((Math.atan2(this.sinAcc, this.cosAcc) * 180) / Math.PI + 360) % 360;
    this.subs.forEach(cb => cb(this._heading));
  };
}
```

- [ ] **Step 3: Update imports in `src/screens/MainScreen.ts`**

Change the two import lines at the top:

```ts
// Before:
import { distanceMeters, densityFromDistance, bearingDegrees, colorIdxFromUserId, stableIdFromUserId } from '../proximity';
import { CompassManager } from '../hooks/useCompass';

// After:
import { distanceMeters, densityFromDistance, bearingDegrees, colorIdxFromUserId, stableIdFromUserId } from '../core/geo';
import { CompassManager } from '../core/compass';
```

- [ ] **Step 4: Delete old files**

```powershell
Remove-Item src\proximity.ts
Remove-Item src\hooks\useCompass.ts
Remove-Item src\hooks -Force   # remove empty dir
```

- [ ] **Step 5: TypeScript check**

```powershell
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```powershell
git add -A
git commit -m "refactor: move proximity→core/geo, useCompass→core/compass"
```

---

## Task 2: services/

Move supabase client and auth, extract presence pipeline from MainScreen.

**Files:**
- Create: `src/services/supabase.ts`
- Create: `src/services/auth.ts`
- Create: `src/services/presence.ts`
- Modify: `src/screens/LobbyScreen.ts` (imports)
- Modify: `src/screens/MainScreen.ts` (imports + presence wiring)
- Delete: `src/supabase.ts`, `src/auth.ts`

- [ ] **Step 1: Create `src/services/supabase.ts`**

```ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

- [ ] **Step 2: Create `src/services/auth.ts`**

Exact copy of `src/auth.ts`, but update the supabase import path:

```ts
import { supabase } from './supabase';   // ← was '../supabase'

const USER_ID_KEY = 'pulse_user_id';
const USER_NAME_KEY = 'pulse_user_name';
const USER_AVATAR_KEY = 'pulse_avatar_url';

export async function initAuth(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    localStorage.setItem(USER_ID_KEY, session.user.id);
    return;
  }

  const existingId = localStorage.getItem(USER_ID_KEY);
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) throw new Error('Auth failed');

  if (existingId !== data.user.id) {
    localStorage.removeItem(USER_NAME_KEY);
    localStorage.removeItem(USER_AVATAR_KEY);
  }
  localStorage.setItem(USER_ID_KEY, data.user.id);
}

export function getUserId(): string {
  return localStorage.getItem(USER_ID_KEY) ?? '';
}

export function getUserName(): string {
  return localStorage.getItem(USER_NAME_KEY) ?? '';
}

export function getAvatarUrl(): string {
  return localStorage.getItem(USER_AVATAR_KEY) ?? '';
}

export function setUserName(name: string): void {
  localStorage.setItem(USER_NAME_KEY, name);
}

export function setAvatarUrl(url: string): void {
  localStorage.setItem(USER_AVATAR_KEY, url);
}

export function isProfileComplete(): boolean {
  return !!getUserName();
}

export function getCurrentRoomId(): string {
  return localStorage.getItem('pulse_room_id') ?? '';
}

export function setCurrentRoomId(id: string): void {
  localStorage.setItem('pulse_room_id', id);
}

export function clearCurrentRoom(): void {
  localStorage.removeItem('pulse_room_id');
}
```

- [ ] **Step 3: Create `src/services/presence.ts`**

Extract the GPS watch + polling pipeline from MainScreen.ts into a class. All logic bodies are moved verbatim; only the hosting (module-level vars → class fields, direct `friends` mutation → callback) changes.

```ts
import { supabase } from './supabase';
import { getUserId } from './auth';
import { distanceMeters, densityFromDistance, bearingDegrees, colorIdxFromUserId, stableIdFromUserId } from '../core/geo';
import type { Friend } from '../state';

export class PresenceService {
  private watchId:      number | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private lat:          number | null = null;
  private lng:          number | null = null;
  private ghost = false;

  constructor(
    private readonly roomId:    string,
    private readonly userId:    string,
    private readonly onFriends: (friends: Friend[]) => void,
    private readonly onGpsError: () => void,
  ) {}

  start(): void {
    this.startTracking();
    this.startPoll();
    void this.poll();
  }

  stop(): void {
    this.stopPoll();
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  async setGhost(ghost: boolean): Promise<void> {
    this.ghost = ghost;
    const { error: ghostError } = await supabase
      .from('room_members')
      .update({ is_ghost: ghost })
      .eq('room_id', this.roomId)
      .eq('user_id', this.userId);
    if (ghostError) console.error('[Pulse] ghost update:', ghostError);

    if (ghost) {
      const { error: locationDeleteError } = await supabase
        .from('locations')
        .delete()
        .eq('user_id', this.userId);
      if (locationDeleteError) console.error('[Pulse] ghost location delete:', locationDeleteError);
    }
  }

  async pushLocation(): Promise<void> {
    if (this.lat === null || this.lng === null || this.ghost) return;
    const { error: locError } = await supabase.from('locations').upsert({
      user_id:    this.userId,
      room_id:    this.roomId,
      lat:        this.lat,
      lng:        this.lng,
      updated_at: new Date().toISOString(),
    });
    if (locError) console.error('[Pulse] location upsert:', locError);

    const { error: roomError } = await supabase
      .from('rooms')
      .update({ last_activity: new Date().toISOString() })
      .eq('id', this.roomId);
    if (roomError) console.error('[Pulse] room activity update:', roomError);
  }

  private startTracking(): void {
    if (!navigator.geolocation) return;
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.lat = pos.coords.latitude;
        this.lng = pos.coords.longitude;
        if (!this.ghost) void this.pushLocation();
      },
      (err) => {
        console.warn('[Pulse] GPS error:', err);
        this.onGpsError();
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    );
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void this.poll();
        this.startPoll();
      } else {
        this.stopPoll();
      }
    });
  }

  private startPoll(): void {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(() => void this.poll(), 10000);
  }

  private stopPoll(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  async poll(): Promise<void> {
    if (import.meta.env.DEV) return;
    if (this.lat === null || this.lng === null) return;
    await this.pushLocation();

    const { data: members } = await supabase
      .from('room_members')
      .select('user_id, is_ghost')
      .eq('room_id', this.roomId)
      .eq('is_ghost', false)
      .neq('user_id', this.userId);

    if (!members || members.length === 0) {
      this.onFriends([]);
      return;
    }

    const memberIds = members.map((m: any) => m.user_id);

    const { data: locs } = await supabase
      .from('locations')
      .select('user_id, lat, lng, updated_at')
      .in('user_id', memberIds);

    const { data: users } = await supabase
      .from('users')
      .select('id, name, avatar_url')
      .in('id', memberIds);

    const myLat = this.lat!;
    const myLng = this.lng!;
    const now = Date.now();
    const friends: Friend[] = [];

    locs?.forEach((loc: any) => {
      const lastSeen = new Date(loc.updated_at).getTime();
      if (now - lastSeen > 30000) return;

      const user = users?.find((u: any) => u.id === loc.user_id);
      if (!user) return;

      const dist     = distanceMeters(myLat, myLng, loc.lat, loc.lng);
      const density  = densityFromDistance(dist);
      const bearing  = bearingDegrees(myLat, myLng, loc.lat, loc.lng);
      const colorIdx = colorIdxFromUserId(loc.user_id);

      friends.push({
        id:        stableIdFromUserId(loc.user_id),
        name:      user.name,
        avatarUrl: user.avatar_url ?? null,
        density,
        bearing,
        colorIdx,
        active: true,
      });
    });

    this.onFriends(friends);
  }
}
```

Note: `import type { Friend } from '../state'` — state.ts still exists at this point; it will be replaced in Task 3.

- [ ] **Step 4: Update imports in `src/screens/LobbyScreen.ts`**

Change three import lines at the top:

```ts
// Before:
import { navigateTo } from '../main';
import { getUserId, getUserName, setUserName, setAvatarUrl, getAvatarUrl, setCurrentRoomId, isProfileComplete } from '../auth';
import { supabase } from '../supabase';

// After:
import { navigateTo } from '../main';
import { getUserId, getUserName, setUserName, setAvatarUrl, getAvatarUrl, setCurrentRoomId, isProfileComplete } from '../services/auth';
import { supabase } from '../services/supabase';
```

(The `../visuals/lobbyBackground` import stays until Task 4.)

- [ ] **Step 5: Update imports in `src/screens/MainScreen.ts`**

Replace the supabase, auth, proximity, and compass imports, and wire in PresenceService. The top of MainScreen.ts becomes:

```ts
import { navigateTo } from '../main';
import { getUserId, getCurrentRoomId, clearCurrentRoom, getUserName, getAvatarUrl } from '../services/auth';
import { supabase } from '../services/supabase';
import { friends, resetDevFriends } from '../state';
import { PulseRenderer } from '../visuals/renderer';
import { PresenceService } from '../services/presence';
import { CompassManager } from '../core/compass';
```

Remove these old imports (they are now handled by PresenceService):
```ts
// DELETE these lines:
import { distanceMeters, densityFromDistance, bearingDegrees, colorIdxFromUserId, stableIdFromUserId } from '../core/geo';
```

Remove the module-level variables that moved into PresenceService:
```ts
// DELETE these module-level variables:
let pollInterval: ReturnType<typeof setInterval> | null = null;
let watchId: number | null = null;
let myLat: number | null = null;
let myLng: number | null = null;
```

Add a module-level presence variable:
```ts
let presence: PresenceService | null = null;
```

Replace the body of `mountMainScreen` — change the tracking/polling setup block from:

```ts
startTracking();
startCompass();
startPollInterval();
poll();
```

to:

```ts
const roomId = getCurrentRoomId();
presence = new PresenceService(
  roomId,
  getUserId(),
  (newFriends) => {
    friends.length = 0;
    friends.push(...newFriends);
    renderer?.refreshFriendUi();
    const waiting = document.getElementById('waiting-msg');
    if (waiting) waiting.style.display = newFriends.length === 0 ? 'block' : 'none';
  },
  () => {
    const gpsErr = document.getElementById('gps-error');
    if (gpsErr) {
      gpsErr.style.display = 'block';
      setTimeout(() => { gpsErr.style.display = 'none'; }, 5000);
    }
  },
);
presence.start();
startCompass();
```

Update the ghost button handler:
```ts
document.getElementById('ghost-btn')!.addEventListener('click', async () => {
  isGhost = !isGhost;
  const btn = document.getElementById('ghost-btn')!;
  btn.style.opacity = isGhost ? '1' : '0.35';
  await presence?.setGhost(isGhost);
});
```

Update `leaveRoom()` — replace the tracking cleanup lines:

```ts
// Before:
if (watchId !== null) navigator.geolocation.clearWatch(watchId);
compass?.disable();
compass = null;
stopPollInterval();
const { error: locationDeleteError } = await supabase.from('locations').delete().eq('user_id', userId);
logSupabaseError('leave location delete', locationDeleteError);

// After:
presence?.stop();
presence = null;
compass?.disable();
compass = null;
const { error: locationDeleteError } = await supabase.from('locations').delete().eq('user_id', userId);
logSupabaseError('leave location delete', locationDeleteError);
```

Delete the now-unused standalone functions from MainScreen.ts:
- `startTracking()`
- `startPollInterval()`
- `stopPollInterval()`
- `pushLocation()`
- `poll()`

(Keep `startCompass()`, `loadRoomCode()`, `leaveRoom()`, `createDebugPanel()`, and all UI/style functions.)

- [ ] **Step 6: Delete old files**

```powershell
Remove-Item src\supabase.ts
Remove-Item src\auth.ts
```

- [ ] **Step 7: TypeScript check**

```powershell
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```powershell
git add -A
git commit -m "refactor: move supabase+auth to services/, extract presence pipeline"
```

---

## Task 3: user.ts and devMode.ts

Split `state.ts` into two focused files.

**Files:**
- Create: `src/user.ts`
- Create: `src/devMode.ts`
- Modify: `src/services/presence.ts` (import path)
- Modify: `src/visuals/renderer.ts` (import path)
- Modify: `src/screens/MainScreen.ts` (import path)
- Delete: `src/state.ts`

**Mapping from state.ts:**
- `Friend`, `ViewportSize`, `friendScreenPosition`, `initialsFor`, `friendDistanceLabel` → `user.ts`
  (Note: `friendScreenPosition`, `initialsFor`, `friendDistanceLabel` will move again in Task 4 into `skins/orb/`. Keeping them in `user.ts` for now to avoid a double-move.)
- `DEV_FRIENDS`, `friends`, `resetDevFriends` → `devMode.ts`

- [ ] **Step 1: Create `src/user.ts`**

```ts
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
```

- [ ] **Step 2: Create `src/devMode.ts`**

```ts
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
```

- [ ] **Step 3: Update imports in `src/services/presence.ts`**

```ts
// Before:
import type { Friend } from '../state';

// After:
import type { Friend } from '../user';
```

- [ ] **Step 4: Update imports in `src/visuals/renderer.ts`**

```ts
// Before:
import { Friend, ViewportSize, friendDistanceLabel, friendScreenPosition, initialsFor } from '../state';

// After:
import { Friend, ViewportSize, friendDistanceLabel, friendScreenPosition, initialsFor } from '../user';
```

- [ ] **Step 5: Update imports in `src/screens/MainScreen.ts`**

```ts
// Before:
import { friends, resetDevFriends } from '../state';

// After:
import { friends, resetDevFriends } from '../devMode';
```

- [ ] **Step 6: Delete old file**

```powershell
Remove-Item src\state.ts
```

- [ ] **Step 7: TypeScript check**

```powershell
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```powershell
git add -A
git commit -m "refactor: split state.ts into user.ts and devMode.ts"
```

---

## Task 4: skins/orb/

Move visuals into `skins/orb/`, splitting the renderer class into focused modules and extracting chrome UI from MainScreen.

**Files to create:**
- `src/skins/types.ts`
- `src/skins/orb/shaders.ts`
- `src/skins/orb/theme.ts`
- `src/skins/orb/geometry.ts`
- `src/skins/orb/labels.ts`
- `src/skins/orb/background.ts`
- `src/skins/orb/orbs.ts`
- `src/skins/orb/chrome.ts`
- `src/skins/orb/index.ts`
- `src/skins/radar/index.ts`

**Files to modify:**
- `src/user.ts` (remove functions that move to geometry.ts / labels.ts)
- `src/screens/LobbyScreen.ts` (update lobbyBackground import)
- `src/screens/MainScreen.ts` (update renderer import, wire chrome)

**Files to delete:**
- `src/visuals/shaders.ts`
- `src/visuals/theme.ts`
- `src/visuals/lobbyBackground.ts`
- `src/visuals/renderer.ts`
- `src/visuals/` (directory)

### Step 1: Create `src/skins/types.ts`

```ts
import type { Friend } from '../user';

export interface Skin {
  startRendering(): void;
  destroy(): void;
  refreshFriendUi(): void;
  setHeading(heading: number): void;
}

export interface SkinContext {
  friends: Friend[];
  userProfile: { name: string; avatarUrl?: string | null };
}
```

- [ ] **Step 1: Create `src/skins/types.ts`** (content above)

### Step 2–3: Simple file moves (shaders + theme)

- [ ] **Step 2: Create `src/skins/orb/shaders.ts`**

Exact copy of `src/visuals/shaders.ts`. No import changes needed (no imports in that file).

- [ ] **Step 3: Create `src/skins/orb/theme.ts`**

Exact copy of `src/visuals/theme.ts`. No import changes needed.

### Step 4: Create `src/skins/orb/geometry.ts`

Pulls `friendScreenPosition` from `user.ts` plus the three standalone helpers from `renderer.ts` (`softGravityPull`, `proximityMeters`, `smoothstep`):

- [ ] **Step 4: Create `src/skins/orb/geometry.ts`**

```ts
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
```

### Step 5: Create `src/skins/orb/labels.ts`

Pulls `initialsFor` and `friendDistanceLabel` from `user.ts`:

- [ ] **Step 5: Create `src/skins/orb/labels.ts`**

```ts
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
```

### Step 6: Trim `src/user.ts`

Remove `friendScreenPosition`, `initialsFor`, `friendDistanceLabel` and the `ORB_REACH`/`VERTICAL_SQUEEZE` constants from `user.ts`, since they now live in `geometry.ts` and `labels.ts`. The file becomes just the two interfaces:

- [ ] **Step 6: Overwrite `src/user.ts` with trimmed version**

```ts
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
```

### Step 7: Create `src/skins/orb/orbs.ts`

Orb sizing and merge constants extracted from `renderer.ts`:

- [ ] **Step 7: Create `src/skins/orb/orbs.ts`**

```ts
export const USER_RADIUS = { mobile: 0.062, desktop: 0.09 };
export const FRIEND_RADIUS = {
  mobileBase: 0.018,  mobileDensity: 0.052,
  desktopBase: 0.026, desktopDensity: 0.076,
};

export const MERGE_DISTANCE_METERS = 30;
export const MERGE_STRENGTH        = 0.35;
export const MERGE_SMOOTHNESS      = 28;
export const MERGE_ANIMATION_EASE  = 0.025;
export const MIN_MERGE_SEPARATION  = { mobile: 14, desktop: 18 };
export const MAX_MERGED_FRIENDS    = 10;
export const GRAVITY_MAX_ORBS     = 11;
```

### Step 8: Create `src/skins/orb/background.ts`

Move `LobbyBackground` from `visuals/lobbyBackground.ts`, updating its shader import:

- [ ] **Step 8: Create `src/skins/orb/background.ts`**

Exact copy of `src/visuals/lobbyBackground.ts`, but change the import line:

```ts
import { BACKGROUND_SHADER, GRAVITY_FIELD_SHADER, VERTEX_SHADER } from './shaders';
// (was: from './shaders' — path stays the same since both files are in skins/orb/)
```

The rest of the file is identical to `visuals/lobbyBackground.ts`.

### Step 9: Create `src/skins/orb/chrome.ts`

Extract the main-screen chrome UI (leave button, room code, ghost mode, waiting/GPS-error messages) from `MainScreen.ts`:

- [ ] **Step 9: Create `src/skins/orb/chrome.ts`**

```ts
export interface ChromeHandle {
  setRoomCode(code: string): void;
  setWaiting(show: boolean): void;
  setGpsError(show: boolean): void;
  destroy(): void;
}

export function mountChrome(
  container: HTMLElement,
  opts: {
    onLeave: () => void;
    onGhostToggle: (active: boolean) => Promise<void>;
  },
): { chrome: ChromeHandle; pulseApp: HTMLElement } {
  container.innerHTML = `
    <div id="pulse-main">
      <div class="main-ui">
        <button class="main-back-btn" id="leave-btn">← leave</button>
        <div class="main-room-code-wrap" id="room-code-wrap">
          <span class="main-room-label" id="room-copy-label">room</span>
          <span class="main-room-code" id="room-code-label">···</span>
        </div>
        <button class="main-ghost-btn" id="ghost-btn">👁</button>
      </div>
      <div id="pulse-app"></div>
      <div class="main-waiting" id="waiting-msg" style="display:none">
        share the code with friends
      </div>
      <div class="main-gps-error" id="gps-error" style="display:none">
        GPS signal lost
      </div>
    </div>
  `;

  injectChromeStyles();

  const leaveBtn = container.querySelector<HTMLButtonElement>('#leave-btn')!;
  const roomCodeWrap = container.querySelector<HTMLElement>('#room-code-wrap')!;
  const ghostBtn = container.querySelector<HTMLButtonElement>('#ghost-btn')!;
  const pulseApp = container.querySelector<HTMLElement>('#pulse-app')!;

  leaveBtn.addEventListener('click', () => opts.onLeave());

  let isGhost = false;
  ghostBtn.addEventListener('click', async () => {
    isGhost = !isGhost;
    ghostBtn.style.opacity = isGhost ? '1' : '0.35';
    await opts.onGhostToggle(isGhost);
  });

  roomCodeWrap.addEventListener('click', () => {
    const codeEl = container.querySelector<HTMLElement>('#room-code-label')!;
    const code = codeEl.textContent?.trim() ?? '';
    if (!code || code === '···') return;
    navigator.clipboard.writeText(code).then(() => {
      const label = container.querySelector<HTMLElement>('#room-copy-label')!;
      label.textContent = 'copied!';
      codeEl.classList.add('copied');
      setTimeout(() => {
        label.textContent = 'room';
        codeEl.classList.remove('copied');
      }, 1500);
    });
  });

  const chrome: ChromeHandle = {
    setRoomCode(code: string): void {
      const el = container.querySelector<HTMLElement>('#room-code-label');
      if (el) el.textContent = code;
    },
    setWaiting(show: boolean): void {
      const el = container.querySelector<HTMLElement>('#waiting-msg');
      if (el) el.style.display = show ? 'block' : 'none';
    },
    setGpsError(show: boolean): void {
      const el = container.querySelector<HTMLElement>('#gps-error');
      if (el) el.style.display = show ? 'block' : 'none';
    },
    destroy(): void { /* DOM is cleaned up by the screen */ },
  };

  return { chrome, pulseApp };
}

function injectChromeStyles(): void {
  if (document.getElementById('main-screen-styles')) return;
  const style = document.createElement('style');
  style.id = 'main-screen-styles';
  style.textContent = `
    #pulse-main { position: fixed; inset: 0; }
    #pulse-app  { position: fixed; inset: 0; }
    .main-ui {
      position: fixed; top: 0; left: 0; right: 0; z-index: 10;
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 20px; pointer-events: none;
      height: 70px;
    }
    .main-back-btn {
      pointer-events: all;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.12);
      color: rgba(255,255,255,0.45);
      font-size: 10px; letter-spacing: .15em;
      padding: 8px 14px; border-radius: 999px;
      cursor: pointer; font-family: Inter, system-ui, sans-serif;
      transition: opacity 200ms ease; backdrop-filter: blur(12px);
    }
    .main-back-btn:hover { opacity: 0.7; }
    .main-room-code-wrap {
      position: absolute; left: 50%; transform: translateX(-50%);
      display: flex; flex-direction: column; align-items: center; gap: 4px;
      pointer-events: all; cursor: pointer;
      top: 14px;
    }
    .main-room-label {
      font-size: 9px; letter-spacing: .22em; text-transform: uppercase;
      color: rgba(255,255,255,0.55);
      font-family: Inter, system-ui, sans-serif;
      font-weight: 600;
    }
    .main-room-code {
      font-size: 14px; letter-spacing: .28em;
      font-family: Inter, system-ui, sans-serif; color: rgba(255,255,255,0.92);
      font-weight: 600;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 999px;
      padding: 7px 18px;
      backdrop-filter: blur(12px);
      transition: background 150ms ease, border-color 150ms ease;
      user-select: none;
    }
    .main-room-code-wrap:hover .main-room-code {
      background: rgba(255,255,255,0.16);
      border-color: rgba(255,255,255,0.32);
    }
    .main-room-code.copied {
      background: rgba(255,255,255,0.18);
      border-color: rgba(255,255,255,0.4);
    }
    .main-ghost-btn {
      pointer-events: all;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.12);
      color: white; font-size: 14px;
      width: 34px; height: 34px; border-radius: 999px;
      cursor: pointer; display: grid; place-items: center;
      opacity: 0.35; transition: opacity 200ms ease; backdrop-filter: blur(12px);
    }
    .main-ghost-btn:hover { opacity: 0.7; }
    .main-waiting {
      position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
      font-size: 11px; opacity: 0.25; letter-spacing: 0.08em;
      font-family: Inter, system-ui, sans-serif; color: white;
      white-space: nowrap; z-index: 10;
    }
    .main-gps-error {
      position: fixed; bottom: 120px; left: 50%; transform: translateX(-50%);
      font-size: 11px; color: rgba(255,80,80,0.85); letter-spacing: 0.05em;
      font-family: Inter, system-ui, sans-serif;
      white-space: nowrap; z-index: 10;
    }
  `;
  document.head.appendChild(style);
}
```

### Step 10: Create `src/skins/orb/index.ts`

Move `PulseRenderer` from `visuals/renderer.ts`, updating imports to use the new sub-module paths and replacing the inlined constants with imports from `orbs.ts`:

- [ ] **Step 10: Create `src/skins/orb/index.ts`**

The file is `visuals/renderer.ts` with these changes applied:

1. **Replace imports at the top:**

```ts
// Before:
import { Friend, ViewportSize, friendDistanceLabel, friendScreenPosition, initialsFor } from '../state';
import { BACKGROUND_SHADER, GRAVITY_FIELD_SHADER, MERGED_ORBS_SHADER, VERTEX_SHADER } from './shaders';
import { rgbCss, theme, toneFor } from './theme';

// After:
import type { Friend, ViewportSize } from '../../user';
import { friendScreenPosition } from './geometry';
import { initialsFor, friendDistanceLabel } from './labels';
import { softGravityPull, proximityMeters, smoothstep } from './geometry';
import { BACKGROUND_SHADER, GRAVITY_FIELD_SHADER, MERGED_ORBS_SHADER, VERTEX_SHADER } from './shaders';
import { rgbCss, theme, toneFor } from './theme';
import {
  USER_RADIUS, FRIEND_RADIUS,
  MERGE_DISTANCE_METERS, MERGE_STRENGTH, MERGE_SMOOTHNESS,
  MERGE_ANIMATION_EASE, MIN_MERGE_SEPARATION, MAX_MERGED_FRIENDS, GRAVITY_MAX_ORBS,
} from './orbs';
```

2. **Remove the inlined constants** that are now imported from `orbs.ts` (delete lines 16–31 of the original renderer.ts):

```ts
// DELETE these constant declarations (now imported from orbs.ts):
const USER_RADIUS = ...
const FRIEND_RADIUS = ...
const MERGE_DISTANCE_METERS = ...
const MERGE_STRENGTH = ...
const MERGE_SMOOTHNESS = ...
const MERGE_ANIMATION_EASE = ...
const MIN_MERGE_SEPARATION = ...
const MAX_MERGED_FRIENDS = ...
const GRAVITY_MAX_ORBS = ...
```

3. **Remove the three module-level helper functions** at the bottom that are now imported from `geometry.ts`:

```ts
// DELETE these functions (now in geometry.ts):
function softGravityPull(meters: number): number { ... }
function proximityMeters(density: number): number { ... }
function smoothstep(value: number): number { ... }
```

4. Everything else (the entire `PulseRenderer` class, `injectRendererStyles`) stays verbatim.

### Step 11: Create `src/skins/radar/index.ts`

- [ ] **Step 11: Create `src/skins/radar/index.ts`**

```ts
// Future radar skin
export {};
```

### Step 12: Update LobbyScreen.ts import

- [ ] **Step 12: Update import in `src/screens/LobbyScreen.ts`**

```ts
// Before:
import { LobbyBackground } from '../visuals/lobbyBackground';

// After:
import { LobbyBackground } from '../skins/orb/background';
```

### Step 13: Update MainScreen.ts

- [ ] **Step 13: Update `src/screens/MainScreen.ts`**

Replace the renderer import and wire in chrome:

```ts
// Before:
import { PulseRenderer } from '../visuals/renderer';

// After:
import { PulseRenderer } from '../skins/orb/index';
import { mountChrome } from '../skins/orb/chrome';
```

Replace the `mountMainScreen` body — swap the manually-built HTML + event wiring with a `mountChrome` call. Find the block in `mountMainScreen` that sets `app.innerHTML = ...` through the `loadRoomCode(roomId)` call, and replace it with:

```ts
export function mountMainScreen(app: HTMLElement): void {
  const { chrome, pulseApp } = mountChrome(app, {
    onLeave:       () => { confirm('leave room?') && leaveRoom(); },
    onGhostToggle: (active) => presence?.setGhost(active) ?? Promise.resolve(),
  });

  injectDebugStyles(); // keep (if DEV panel styles still needed)

  if (import.meta.env.DEV) resetDevFriends();

  renderer = new PulseRenderer(pulseApp, friends, { name: getUserName(), avatarUrl: getAvatarUrl() });
  renderer.startRendering();

  const roomId = getCurrentRoomId();
  loadRoomCode(roomId).then(code => chrome.setRoomCode(code));

  presence = new PresenceService(
    roomId,
    getUserId(),
    (newFriends) => {
      friends.length = 0;
      friends.push(...newFriends);
      renderer?.refreshFriendUi();
      chrome.setWaiting(newFriends.length === 0);
    },
    () => {
      chrome.setGpsError(true);
      setTimeout(() => chrome.setGpsError(false), 5000);
    },
  );
  presence.start();
  startCompass();

  if (import.meta.env.DEV) {
    (window as any).__pulse = { friends, renderer };
    const debugPanel = createDebugPanel(renderer);
    document.body.appendChild(debugPanel.panel);
    document.body.appendChild(debugPanel.trigger);
  }
}
```

Update `loadRoomCode` to return the code string:

```ts
async function loadRoomCode(roomId: string): Promise<string> {
  const { data } = await supabase
    .from('rooms')
    .select('code')
    .eq('id', roomId)
    .single();
  return data?.code ?? '';
}
```

Remove the old `injectStyles()` function from MainScreen.ts and its call (now lives in `chrome.ts`). Keep `injectDebugStyles()` and `createDebugPanel()`.

Remove the `isGhost` module-level variable and ghost button handler from the old code (both now live inside `mountChrome`).

Also remove the `room-code-wrap` click handler and `leave-btn` handler (now inside `mountChrome`).

### Step 14: Delete old visuals directory

- [ ] **Step 14: Delete visuals/**

```powershell
Remove-Item src\visuals\shaders.ts
Remove-Item src\visuals\theme.ts
Remove-Item src\visuals\lobbyBackground.ts
Remove-Item src\visuals\renderer.ts
Remove-Item src\visuals -Force
```

- [ ] **Step 15: TypeScript check**

```powershell
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 16: Commit**

```powershell
git add -A
git commit -m "refactor: reorganize visuals into skins/orb/, extract chrome UI"
```

---

## Task 5: screens/ and app.ts

Rename screen files and the entry point.

**Files:**
- Create: `src/screens/permission.ts`
- Create: `src/screens/lobby.ts`
- Create: `src/screens/main.ts`
- Create: `src/app.ts`
- Modify: `index.html` (update script src)
- Delete: `src/screens/PermissionScreen.ts`, `src/screens/LobbyScreen.ts`, `src/screens/MainScreen.ts`, `src/main.ts`

- [ ] **Step 1: Create `src/app.ts`**

Copy of `src/main.ts`, changing screen import paths from PascalCase to lowercase:

```ts
import { initAuth, isProfileComplete, getCurrentRoomId } from './services/auth';

export type Screen = 'permission' | 'lobby' | 'main';

export async function navigateTo(screen: Screen): Promise<void> {
  const app = document.getElementById('app')!;
  app.innerHTML = '';

  if (screen === 'permission') {
    const { mountPermissionScreen } = await import('./screens/permission');
    mountPermissionScreen(app);
  } else if (screen === 'lobby') {
    const { mountLobbyScreen } = await import('./screens/lobby');
    mountLobbyScreen(app);
  } else if (screen === 'main') {
    const { mountMainScreen } = await import('./screens/main');
    mountMainScreen(app);
  }
}

async function boot(): Promise<void> {
  try {
    await initAuth();
  } catch (err) {
    console.error('[Pulse] boot auth failed:', err);
    return;
  }

  let permissionGranted = false;
  try {
    const result = await navigator.permissions.query({ name: 'geolocation' });
    permissionGranted = result.state === 'granted';
  } catch {
    permissionGranted = false;
  }

  if (!permissionGranted) {
    await navigateTo('permission');
    return;
  }

  if (getCurrentRoomId()) {
    await navigateTo('main');
    return;
  }

  await navigateTo('lobby');
}

boot();
```

- [ ] **Step 2: Create `src/screens/permission.ts`**

Exact copy of `src/screens/PermissionScreen.ts`, but change the import line:

```ts
// Before:
import { navigateTo } from '../main';

// After:
import { navigateTo } from '../app';
```

The rest of the file is identical.

- [ ] **Step 3: Create `src/screens/lobby.ts`**

Exact copy of `src/screens/LobbyScreen.ts`, with updated imports:

```ts
// Before:
import { navigateTo } from '../main';
import { getUserId, getUserName, setUserName, setAvatarUrl, getAvatarUrl, setCurrentRoomId, isProfileComplete } from '../services/auth';
import { supabase } from '../services/supabase';
import { LobbyBackground } from '../skins/orb/background';

// After (same, no changes needed — imports are already updated from Tasks 2 and 4):
import { navigateTo } from '../app';
import { getUserId, getUserName, setUserName, setAvatarUrl, getAvatarUrl, setCurrentRoomId, isProfileComplete } from '../services/auth';
import { supabase } from '../services/supabase';
import { LobbyBackground } from '../skins/orb/background';
```

The `navigateTo` import path changes to `'../app'`.

- [ ] **Step 4: Create `src/screens/main.ts`**

Exact copy of `src/screens/MainScreen.ts`, with updated import:

```ts
// Before:
import { navigateTo } from '../main';

// After:
import { navigateTo } from '../app';
```

- [ ] **Step 5: Update `index.html`**

Change the script src from `/src/main.ts` to `/src/app.ts`:

```html
<!-- Before: -->
<script type="module" src="/src/main.ts"></script>

<!-- After: -->
<script type="module" src="/src/app.ts"></script>
```

- [ ] **Step 6: Delete old files**

```powershell
Remove-Item src\screens\PermissionScreen.ts
Remove-Item src\screens\LobbyScreen.ts
Remove-Item src\screens\MainScreen.ts
Remove-Item src\main.ts
```

- [ ] **Step 7: TypeScript check**

```powershell
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```powershell
git add -A
git commit -m "refactor: rename screens to lowercase, main.ts → app.ts"
```

---

## Final file tree check

After all tasks the tree should be:

```
src/
├── user.ts
├── devMode.ts
├── app.ts
├── core/
│   ├── geo.ts
│   └── compass.ts
├── services/
│   ├── supabase.ts
│   ├── auth.ts
│   └── presence.ts
├── skins/
│   ├── types.ts
│   ├── orb/
│   │   ├── index.ts
│   │   ├── background.ts
│   │   ├── orbs.ts
│   │   ├── labels.ts
│   │   ├── chrome.ts
│   │   ├── geometry.ts
│   │   ├── theme.ts
│   │   └── shaders.ts
│   └── radar/
│       └── index.ts
└── screens/
    ├── permission.ts
    ├── lobby.ts
    └── main.ts
```

Run `npx tsc --noEmit` one final time to confirm zero errors across the whole project.
