import { navigateTo } from '../main';
import { getUserId, getUserName, setCurrentRoomId } from '../auth';
import { supabase } from '../supabase';

export function mountLobbyScreen(app: HTMLElement): void {
  app.innerHTML = `
    <div class="lobby-screen">
      <div class="lobby-title">PULSE</div>
      <div class="lobby-greeting">hello, ${getUserName()}</div>

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

      <div class="lobby-error" id="lobby-error"></div>
    </div>
  `;

  injectStyles();

  const codeInput = document.getElementById('code-input') as HTMLInputElement;
  const errorEl = document.getElementById('lobby-error')!;

  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase();
    errorEl.textContent = '';
  });

  document.getElementById('create-btn')!.addEventListener('click', async () => {
    errorEl.textContent = '';
    const btn = document.getElementById('create-btn') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = '...';

    const code = generateCode();
    const userId = getUserId();

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

    await supabase.from('users').upsert({ id: userId, name: getUserName() });

    await supabase.from('room_members').insert({
      room_id: room.id,
      user_id: userId,
    });

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

    // Check expiry (1 hour inactivity)
    const lastActivity = new Date(room.last_activity).getTime();
    if (Date.now() - lastActivity > 60 * 60 * 1000) {
      errorEl.textContent = 'room has expired';
      joinBtn.disabled = false;
      joinBtn.textContent = 'JOIN';
      return;
    }

    // Check capacity
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

    const userId = getUserId();
    await supabase.from('users').upsert({ id: userId, name: getUserName() });
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
      gap: 16px;
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
    }

    .lobby-greeting {
      font-size: 12px;
      opacity: 0.35;
      letter-spacing: 0.05em;
      margin-bottom: 8px;
    }

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
      margin: 4px 0;
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
