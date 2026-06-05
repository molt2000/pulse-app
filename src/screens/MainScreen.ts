import { navigateTo } from '../main';
import { getUserId, getCurrentRoomId, clearCurrentRoom, getUserName, getAvatarUrl } from '../auth';
import { supabase } from '../supabase';
import { friends, resetDevFriends } from '../state';
import { PulseRenderer } from '../visuals/renderer';
import { distanceMeters, densityFromDistance, bearingDegrees, colorIdxFromUserId, stableIdFromUserId } from '../proximity';
import { CompassManager } from '../hooks/useCompass';

let renderer:        PulseRenderer | null = null;
let pollInterval:    ReturnType<typeof setInterval> | null = null;
let watchId:         number | null = null;
let myLat:           number | null = null;
let myLng:           number | null = null;
let isGhost = false;
let debugKeyHandler: ((e: KeyboardEvent) => void) | null = null;
let compass: CompassManager | null = null;

function logSupabaseError(context: string, error: unknown): void {
  if (!error) return;
  console.error(`[Pulse] ${context}:`, error);
}

export function mountMainScreen(app: HTMLElement): void {
  app.innerHTML = `
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

  injectStyles();

  if (import.meta.env.DEV) resetDevFriends();

  const pulseApp = document.getElementById('pulse-app')!;
  renderer = new PulseRenderer(pulseApp, friends, { name: getUserName(), avatarUrl: getAvatarUrl() });
  renderer.startRendering();

  const roomId = getCurrentRoomId();
  loadRoomCode(roomId);

  document.getElementById('room-code-wrap')!.addEventListener('click', () => {
    const codeEl = document.getElementById('room-code-label')!;
    const code = codeEl.textContent?.trim() ?? '';
    if (!code || code === '···') return;
    navigator.clipboard.writeText(code).then(() => {
      const label = document.getElementById('room-copy-label')!;
      label.textContent = 'copied!';
      codeEl.classList.add('copied');
      setTimeout(() => {
        label.textContent = 'room';
        codeEl.classList.remove('copied');
      }, 1500);
    });
  });

  startTracking();
  startCompass();
  startPollInterval();
  poll();

  document.getElementById('leave-btn')!.addEventListener('click', async () => {
    const confirmed = confirm('leave room?');
    if (!confirmed) return;
    await leaveRoom();
  });

  document.getElementById('ghost-btn')!.addEventListener('click', async () => {
    isGhost = !isGhost;
    const btn = document.getElementById('ghost-btn')!;
    btn.style.opacity = isGhost ? '1' : '0.35';
    const { error: ghostError } = await supabase
      .from('room_members')
      .update({ is_ghost: isGhost })
      .eq('room_id', roomId)
      .eq('user_id', getUserId());
    logSupabaseError('ghost update', ghostError);

    if (isGhost) {
      const { error: locationDeleteError } = await supabase
        .from('locations')
        .delete()
        .eq('user_id', getUserId());
      logSupabaseError('ghost location delete', locationDeleteError);
    }
  });

  if (import.meta.env.DEV) {
    (window as any).__pulse = { friends, renderer, poll };
    console.info('[Pulse DEV] use window.__pulse to inspect');
    const debugPanel = createDebugPanel(renderer);
    document.body.appendChild(debugPanel.panel);
    document.body.appendChild(debugPanel.trigger);
  }
}

async function loadRoomCode(roomId: string): Promise<void> {
  const { data } = await supabase
    .from('rooms')
    .select('code')
    .eq('id', roomId)
    .single();
  if (data) {
    const label = document.getElementById('room-code-label');
    if (label) label.textContent = data.code;
  }
}

function startCompass(): void {
  compass = new CompassManager();
  if (!compass.supported) return;

  // On iOS the orientation permission was already requested in PermissionScreen
  // alongside location — so enable() can be called directly here, no gesture needed.
  compass.enable().then(ok => {
    if (ok) compass!.subscribe(heading => renderer?.setHeading(heading));
  });
}

function startTracking(): void {
  if (!navigator.geolocation) return;
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      myLat = pos.coords.latitude;
      myLng = pos.coords.longitude;
      if (!isGhost) pushLocation();
    },
    (err) => {
      console.warn('[Pulse] GPS error:', err);
      const gpsErr = document.getElementById('gps-error');
      if (gpsErr) gpsErr.style.display = 'block';
      setTimeout(() => {
        if (gpsErr) gpsErr.style.display = 'none';
      }, 5000);
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
  );
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      poll();
      startPollInterval();
    } else {
      stopPollInterval();
    }
  });
}

function startPollInterval(): void {
  if (pollInterval) return;
  pollInterval = setInterval(() => poll(), 10000);
}

function stopPollInterval(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

async function pushLocation(): Promise<void> {
  if (myLat === null || myLng === null || isGhost) return;
  const roomId = getCurrentRoomId();
  const { error: locError } = await supabase.from('locations').upsert({
    user_id:    getUserId(),
    room_id:    roomId,
    lat:        myLat,
    lng:        myLng,
    updated_at: new Date().toISOString(),
  });
  logSupabaseError('location upsert', locError);

  const { error: roomError } = await supabase
    .from('rooms')
    .update({ last_activity: new Date().toISOString() })
    .eq('id', roomId);
  logSupabaseError('room activity update', roomError);
}

async function poll(): Promise<void> {
  if (import.meta.env.DEV) return;
  if (myLat === null || myLng === null) return;
  const roomId = getCurrentRoomId();
  const myId   = getUserId();
  await pushLocation();

  const { data: members } = await supabase
    .from('room_members')
    .select('user_id, is_ghost')
    .eq('room_id', roomId)
    .eq('is_ghost', false)
    .neq('user_id', myId);

  const waiting = document.getElementById('waiting-msg');
  if (!members || members.length === 0) {
    friends.length = 0;
    renderer?.refreshFriendUi();
    if (waiting) waiting.style.display = 'block';
    return;
  }
  if (waiting) waiting.style.display = 'none';

  const memberIds = members.map((m: any) => m.user_id);

  const { data: locs } = await supabase
    .from('locations')
    .select('user_id, lat, lng, updated_at')
    .in('user_id', memberIds);

  const { data: users } = await supabase
    .from('users')
    .select('id, name, avatar_url')
    .in('id', memberIds);

  friends.length = 0;
  const now = Date.now();

  locs?.forEach((loc: any) => {
    const lastSeen = new Date(loc.updated_at).getTime();
    if (now - lastSeen > 30000) return;

    const user = users?.find((u: any) => u.id === loc.user_id);
    if (!user) return;

    const dist     = distanceMeters(myLat!, myLng!, loc.lat, loc.lng);
    const density  = densityFromDistance(dist);
    const bearing  = bearingDegrees(myLat!, myLng!, loc.lat, loc.lng);
    const colorIdx = colorIdxFromUserId(loc.user_id);

    friends.push({
      id:        stableIdFromUserId(loc.user_id),
      name:      user.name,
      avatarUrl: user.avatar_url ?? null,
      density,
      bearing,   // raw GPS bearing — heading offset applied live in renderer
      colorIdx,
      active: true,
    });
  });

  renderer?.refreshFriendUi();
}

async function leaveRoom(): Promise<void> {
  const roomId = getCurrentRoomId();
  const userId = getUserId();
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  compass?.disable();
  compass = null;
  stopPollInterval();
  const { error: locationDeleteError } = await supabase.from('locations').delete().eq('user_id', userId);
  logSupabaseError('leave location delete', locationDeleteError);

  const { error: memberDeleteError } = await supabase
    .from('room_members')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', userId);
  logSupabaseError('leave member delete', memberDeleteError);

  clearCurrentRoom();
  friends.length = 0;
  if (renderer) {
    renderer.destroy();
    renderer = null;
  }
  navigateTo('lobby');
}

function createDebugPanel(r: PulseRenderer): { panel: HTMLDivElement; trigger: HTMLButtonElement } {
  document.querySelector('.pulse-debug-panel')?.remove();
  document.querySelector('.pulse-debug-trigger')?.remove();
  if (debugKeyHandler) {
    window.removeEventListener('keydown', debugKeyHandler);
    debugKeyHandler = null;
  }

  const panel = document.createElement('div');
  panel.className = 'pulse-debug-panel';

  const title = document.createElement('div');
  title.className = 'pulse-debug-title';
  title.textContent = 'Proximity & bearing';
  panel.appendChild(title);

  for (const friend of friends) {
    const row = document.createElement('label');
    row.className = 'pulse-debug-row';

    const name = document.createElement('span');
    name.textContent = friend.name;

    const density = document.createElement('input');
    density.type = 'range';
    density.min = '0';
    density.max = '100';
    density.value = String(Math.round(friend.density * 100));
    density.dataset.id = String(friend.id);
    density.dataset.field = 'density';

    const valueOut = document.createElement('output');
    valueOut.id = `density-${friend.id}`;
    valueOut.textContent = `${density.value}%`;

    const bearing = document.createElement('input');
    bearing.type = 'range';
    bearing.min = '0';
    bearing.max = '359';
    bearing.value = String(friend.bearing);
    bearing.dataset.id = String(friend.id);
    bearing.dataset.field = 'bearing';

    row.append(name, density, valueOut, bearing);
    panel.appendChild(row);
  }

  panel.addEventListener('input', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;

    const friend = friends.find((item) => item.id === Number(input.dataset.id));
    if (!friend) return;

    if (input.dataset.field === 'density') {
      friend.density = Number(input.value) / 100;
      const out = document.getElementById(`density-${friend.id}`);
      if (out) out.textContent = `${input.value}%`;
    }
    if (input.dataset.field === 'bearing') {
      friend.bearing = Number(input.value);
    }

    r.refreshFriendUi();
  });

  const trigger = document.createElement('button');
  trigger.className = 'pulse-debug-trigger';
  trigger.type = 'button';
  trigger.textContent = 'D';
  trigger.setAttribute('aria-label', 'Toggle proximity controls');

  const toggle = (): void => { panel.classList.toggle('is-open'); };
  trigger.addEventListener('click', toggle);
  debugKeyHandler = (event) => { if (event.key.toLowerCase() === 'd') toggle(); };
  window.addEventListener('keydown', debugKeyHandler);

  injectDebugStyles();
  return { panel, trigger };
}

function injectDebugStyles(): void {
  if (document.getElementById('debug-panel-styles')) return;
  const style = document.createElement('style');
  style.id = 'debug-panel-styles';
  style.textContent = `
    .pulse-debug-panel {
      position: fixed;
      right: max(14px, env(safe-area-inset-right));
      top: 50%;
      z-index: 20;
      width: min(320px, calc(100vw - 28px));
      padding: 14px;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      background: rgba(7,8,9,0.72);
      box-shadow: 0 22px 70px rgba(0,0,0,0.38);
      backdrop-filter: blur(18px);
      opacity: 0;
      pointer-events: none;
      transform: translate3d(0,-46%,0) scale(0.98);
      transition: opacity 220ms ease, transform 220ms ease;
    }
    .pulse-debug-panel.is-open {
      opacity: 1;
      pointer-events: auto;
      transform: translate3d(0,-50%,0) scale(1);
    }
    .pulse-debug-title {
      margin-bottom: 12px;
      color: rgba(246,242,232,0.46);
      font: 680 10px/1 system-ui,sans-serif;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    .pulse-debug-row {
      display: grid;
      grid-template-columns: 56px 1fr 38px 1fr;
      align-items: center;
      gap: 8px;
      margin-top: 9px;
      color: rgba(246,242,232,0.72);
      font: 560 11px/1.2 system-ui,sans-serif;
    }
    .pulse-debug-row output {
      color: rgba(246,242,232,0.42);
      font-variant-numeric: tabular-nums;
      text-align: right;
    }
    .pulse-debug-row input { width: 100%; accent-color: #ded7c6; }
    .pulse-debug-trigger {
      position: fixed;
      left: 50%;
      bottom: max(16px, env(safe-area-inset-bottom));
      z-index: 22;
      width: 34px; height: 34px;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 999px;
      background: rgba(255,255,255,0.045);
      color: rgba(246,242,232,0.28);
      font: 700 10px/1 system-ui,sans-serif;
      transform: translateX(-50%);
      backdrop-filter: blur(12px);
      cursor: pointer;
    }
    @media (max-width: 620px) {
      .pulse-debug-panel {
        right: 14px; left: 14px;
        top: auto; bottom: 62px;
        width: auto;
        transform: translate3d(0,12px,0) scale(0.98);
      }
      .pulse-debug-panel.is-open {
        transform: translate3d(0,0,0) scale(1);
      }
      .pulse-debug-row { grid-template-columns: 52px 1fr 34px 1fr; }
    }
  `;
  document.head.appendChild(style);
}

function injectStyles(): void {
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
