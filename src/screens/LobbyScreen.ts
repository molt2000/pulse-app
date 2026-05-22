import { navigateTo } from '../main';
import { getUserId, getUserName, setUserName, setAvatarUrl, getAvatarUrl, setCurrentRoomId, isProfileComplete } from '../auth';
import { supabase } from '../supabase';

export function mountLobbyScreen(app: HTMLElement): void {
  const userId = getUserId();
  const hasProfile = isProfileComplete();

  app.innerHTML = `
    <div class="lobby-screen">
      <div class="lobby-title">PULSE</div>

      <!-- Avatar -->
      <div class="lobby-avatar-wrap">
        <div class="lobby-avatar" id="avatar-preview">
          ${getAvatarUrl()
            ? `<img src="${getAvatarUrl()}" />`
            : `<span>${getUserName()?.charAt(0)?.toUpperCase() || '+'}</span>`}
        </div>
        <input type="file" id="avatar-input" accept="image/*" style="display:none" />
      </div>

      <!-- Name -->
      <input
        class="lobby-input"
        id="name-input"
        type="text"
        placeholder="your name"
        maxlength="20"
        value="${getUserName() || ''}"
        autocomplete="off"
      />

      <!-- Room Actions (nur wenn Profil vollständig) -->
      <div id="room-actions" style="display:${hasProfile ? 'flex' : 'none'}; flex-direction:column; align-items:center; gap:16px; width:100%;">
        <button class="lobby-btn" id="create-btn">CREATE ROOM</button>
        <div class="lobby-or">── or ──</div>
        <div class="lobby-join-row">
          <input
            class="lobby-code-input"
            id="code-input"
            type="text"
            placeholder="room code"
            maxlength="6"
            autocomplete="off"
            autocapitalize="characters"
          />
          <button class="lobby-btn-small" id="join-btn">JOIN</button>
        </div>
      </div>

      <!-- Continue (nur wenn kein Profil) -->
      <button class="lobby-btn" id="continue-btn" style="display:${hasProfile ? 'none' : 'block'}">CONTINUE</button>

      <div class="lobby-error" id="lobby-error"></div>
    </div>
  `;

  injectStyles();

  const avatarPreview = document.getElementById('avatar-preview')!;
  const avatarInput = document.getElementById('avatar-input') as HTMLInputElement;
  const nameInput = document.getElementById('name-input') as HTMLInputElement;
  const errorEl = document.getElementById('lobby-error')!;
  const roomActions = document.getElementById('room-actions')!;
  const continueBtn = document.getElementById('continue-btn') as HTMLButtonElement;

  // Avatar click
  avatarPreview.addEventListener('click', () => avatarInput.click());

  avatarInput.addEventListener('change', async () => {
    const file = avatarInput.files?.[0];
    if (!file) return;
    const resized = await resizeImage(file, 256);
    const path = `${userId}.jpg`;
    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, resized, { upsert: true, contentType: 'image/jpeg' });
    if (error) { errorEl.textContent = 'upload failed'; return; }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    setAvatarUrl(data.publicUrl);
    avatarPreview.innerHTML = `<img src="${data.publicUrl}" />`;
  });

  // Name change → update avatar initial live
  nameInput.addEventListener('input', () => {
    errorEl.textContent = '';
    if (!getAvatarUrl()) {
      avatarPreview.innerHTML = `<span>${nameInput.value.charAt(0).toUpperCase() || '+'}</span>`;
    }
  });

  // Save profile helper
  async function saveProfile(): Promise<boolean> {
    const name = nameInput.value.trim();
    if (!name) { errorEl.textContent = 'enter your name'; return false; }

    const { error } = await supabase.from('users').upsert({
      id: userId,
      name,
      avatar_url: getAvatarUrl() || null,
    });

    if (error) { errorEl.textContent = 'something went wrong'; return false; }

    setUserName(name);
    return true;
  }

  // CONTINUE (erster Start, kein Profil)
  continueBtn.addEventListener('click', async () => {
    continueBtn.disabled = true;
    continueBtn.textContent = '...';
    const ok = await saveProfile();
    if (!ok) {
      continueBtn.disabled = false;
      continueBtn.textContent = 'CONTINUE';
      return;
    }
    continueBtn.style.display = 'none';
    roomActions.style.display = 'flex';
  });

  // Name blur → autosave wenn Profil schon existiert
  nameInput.addEventListener('blur', async () => {
    if (!isProfileComplete()) return;
    const name = nameInput.value.trim();
    if (!name || name === getUserName()) return;
    await saveProfile();
  });

  // ── Room Actions ─────────────────────────────────────────
  const codeInput = document.getElementById('code-input') as HTMLInputElement;

  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase();
    errorEl.textContent = '';
  });

  document.getElementById('create-btn')!.addEventListener('click', async () => {
    errorEl.textContent = '';
    const btn = document.getElementById('create-btn') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = '...';

    // Autosave name before entering room
    await saveProfile();

    const code = generateCode();
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .insert({ code, created_by: userId })
      .select()
      .single();

    if (roomError || !room) {
      errorEl.textContent = 'could not create room';
      btn.disabled = false;
      btn.textContent = 'CREATE ROOM';
      return;
    }

    await supabase.from('room_members').insert({ room_id: room.id, user_id: userId });
    setCurrentRoomId(room.id);
    navigateTo('main');
  });

  document.getElementById('join-btn')!.addEventListener('click', async () => {
    const code = codeInput.value.trim().toUpperCase();
    if (code.length !== 6) { errorEl.textContent = 'enter a 6-digit code'; return; }

    errorEl.textContent = '';
    const joinBtn = document.getElementById('join-btn') as HTMLButtonElement;
    joinBtn.disabled = true;
    joinBtn.textContent = '...';

    // Autosave name before entering room
    await saveProfile();

    const { data: room, error } = await supabase
      .from('rooms')
      .select()
      .eq('code', code)
      .single();

    if (error || !room) {
      errorEl.textContent = 'room not found';
      joinBtn.disabled = false;
      joinBtn.textContent = 'JOIN';
      return;
    }

    const lastActivity = new Date(room.last_activity).getTime();
    if (Date.now() - lastActivity > 60 * 60 * 1000) {
      errorEl.textContent = 'room has expired';
      joinBtn.disabled = false;
      joinBtn.textContent = 'JOIN';
      return;
    }

    const { count } = await supabase
      .from('room_members')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', room.id);

    if ((count ?? 0) >= 10) {
      errorEl.textContent = 'room is full';
      joinBtn.disabled = false;
      joinBtn.textContent = 'JOIN';
      return;
    }

    await supabase.from('room_members').upsert({ room_id: room.id, user_id: userId });
    setCurrentRoomId(room.id);
    navigateTo('main');
  });
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}

async function resizeImage(file: File, size: number): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
      canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.85);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

function injectStyles(): void {
  if (document.getElementById('lobby-styles')) return;
  const style = document.createElement('style');
  style.id = 'lobby-styles';
  style.textContent = `
    .lobby-screen {
      position: fixed;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 20px;
      background:
        repeating-linear-gradient(0deg, rgba(180,20,20,0.10) 0px, transparent 1px, transparent 60px),
        repeating-linear-gradient(90deg, rgba(180,20,20,0.10) 0px, transparent 1px, transparent 60px),
        #020304;
      color: white;
      font-family: Inter, system-ui, sans-serif;
    }

    .lobby-title {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 10px;
      letter-spacing: .4em;
      opacity: .4;
      color: white;
    }

    .lobby-avatar-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .lobby-avatar {
      width: 80px;
      height: 80px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.18);
      display: grid;
      place-items: center;
      cursor: pointer;
      overflow: hidden;
      font-size: 28px;
      opacity: 0.6;
      transition: opacity 200ms ease;
    }

    .lobby-avatar:hover { opacity: 1; }
    .lobby-avatar img { width: 100%; height: 100%; object-fit: cover; }

    .lobby-input {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.12);
      color: white;
      font-size: 15px;
      padding: 13px 20px;
      border-radius: 8px;
      width: 240px;
      text-align: center;
      outline: none;
      font-family: Inter, system-ui, sans-serif;
      transition: border-color 200ms ease;
    }

    .lobby-input::placeholder { opacity: 0.3; }
    .lobby-input:focus { border-color: rgba(255,255,255,0.35); }

    .lobby-btn {
      border: 1px solid rgba(255,255,255,0.18);
      background: transparent;
      color: white;
      font-size: 11px;
      letter-spacing: .2em;
      padding: 13px 36px;
      border-radius: 999px;
      cursor: pointer;
      transition: opacity 200ms ease;
      font-family: Inter, system-ui, sans-serif;
    }

    .lobby-btn:hover { opacity: 0.7; }
    .lobby-btn:disabled { opacity: 0.3; cursor: default; }

    .lobby-or {
      font-size: 10px;
      opacity: 0.2;
      letter-spacing: 0.15em;
    }

    .lobby-join-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .lobby-code-input {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.12);
      color: white;
      font-size: 15px;
      padding: 12px 16px;
      border-radius: 8px;
      width: 140px;
      text-align: center;
      outline: none;
      font-family: Inter, system-ui, sans-serif;
      letter-spacing: 0.2em;
      transition: border-color 200ms ease;
    }

    .lobby-code-input::placeholder { opacity: 0.3; letter-spacing: 0.05em; }
    .lobby-code-input:focus { border-color: rgba(255,255,255,0.35); }

    .lobby-btn-small {
      border: 1px solid rgba(255,255,255,0.18);
      background: transparent;
      color: white;
      font-size: 10px;
      letter-spacing: .2em;
      padding: 12px 20px;
      border-radius: 999px;
      cursor: pointer;
      transition: opacity 200ms ease;
      font-family: Inter, system-ui, sans-serif;
    }

    .lobby-btn-small:hover { opacity: 0.7; }
    .lobby-btn-small:disabled { opacity: 0.3; }

    .lobby-error {
      font-size: 11px;
      color: rgba(255,80,80,0.85);
      min-height: 16px;
      letter-spacing: 0.02em;
    }
  `;
  document.head.appendChild(style);
}
