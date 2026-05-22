import { navigateTo } from '../main';
import { getUserId, getCurrentRoomId, clearCurrentRoom } from '../auth';
import { supabase } from '../supabase';
import { friends } from '../state';
import { PulseRenderer } from '../visuals/renderer';
import { distanceMeters, densityFromDistance, bearingDegrees, colorIdxFromUserId, stableIdFromUserId } from '../proximity';

let renderer:     PulseRenderer | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let watchId:      number | null = null;
let myLat:        number | null = null;
let myLng:        number | null = null;
let isGhost = false;

function logSupabaseError(context: string, error: unknown): void {
  if (!error) return;
  console.error(`[Pulse] ${context}:`, error);
}

export function mountMainScreen(app: HTMLElement): void {
  app.innerHTML = `
    <div id="pulse-main">
      <div class="main-ui">
        <button class="main-back-btn" id="leave-btn">← leave</button>
        <span class="main-room-code" id="room-code-label">PULSE</span>
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

  const pulseApp = document.getElementById('pulse-app')!;
  renderer = new PulseRenderer(pulseApp, friends);
  renderer.startRendering();

  const roomId = getCurrentRoomId();
  loadRoomCode(roomId);
  startTracking();
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
    if (waiting) waiting.style.display = 'block';
    return; // friends array NICHT leeren
  }
  if (waiting) waiting.style.display = 'none';

  const memberIds = members.map((m: any) => m.user_id);

  const { data: locs } = await supabase
    .from('locations')
    .select('user_id, lat, lng, updated_at')
    .in('user_id', memberIds);

  // avatar_url wird jetzt mitgeladen ← NEU
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
      avatarUrl: user.avatar_url ?? null,   // ← NEU: Profilbild weitergeben
      density,
      bearing,
      colorIdx,
      active: true,
    });
  });

  renderer?.refreshFriendUi();
}

async function leaveRoom(): Promise<void> {
  const roomId = getCurrentRoomId();
  const userId = getUserId();
  if (watchId !== null)     navigator.geolocation.clearWatch(watchId);
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
    .main-room-code {
      font-size: 10px; letter-spacing: .35em;
      opacity: 0.25; font-family: Inter, system-ui, sans-serif; color: white;
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
