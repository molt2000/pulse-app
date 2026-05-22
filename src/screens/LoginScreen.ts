import { navigateTo } from '../main';
import { getUserId, setUserName, setAvatarUrl, getUserName, getAvatarUrl } from '../auth';
import { supabase } from '../supabase';

export function mountLoginScreen(app: HTMLElement): void {
  const existingName = getUserName();
  const existingAvatar = getAvatarUrl();

  app.innerHTML = `
    <div class="login-screen">
      <div class="login-title">PULSE</div>

      <div class="login-avatar-wrap">
        <div class="login-avatar" id="avatar-preview">
          ${existingAvatar
            ? `<img src="${existingAvatar}" />`
            : `<span id="avatar-initials">+</span>`}
        </div>
        <input type="file" id="avatar-input" accept="image/*" style="display:none" />
      </div>

      <input
        class="login-input"
        id="name-input"
        type="text"
        placeholder="your name"
        maxlength="20"
        value="${existingName}"
        autocomplete="off"
      />

      <button class="login-btn" id="continue-btn">CONTINUE</button>
      <div class="login-error" id="login-error"></div>
    </div>
  `;

  injectStyles();

  const avatarPreview = document.getElementById('avatar-preview')!;
  const avatarInput = document.getElementById('avatar-input') as HTMLInputElement;
  const nameInput = document.getElementById('name-input') as HTMLInputElement;
  const continueBtn = document.getElementById('continue-btn') as HTMLButtonElement;
  const errorEl = document.getElementById('login-error')!;

  avatarPreview.addEventListener('click', () => avatarInput.click());

  avatarInput.addEventListener('change', async () => {
    const file = avatarInput.files?.[0];
    if (!file) return;

    const resized = await resizeImage(file, 256);
    const userId = getUserId();
    const path = `${userId}.jpg`;

    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, resized, { upsert: true, contentType: 'image/jpeg' });

    if (error) { errorEl.textContent = 'upload failed'; return; }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    setAvatarUrl(data.publicUrl);

    avatarPreview.innerHTML = `<img src="${data.publicUrl}" />`;
  });

  continueBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name) { errorEl.textContent = 'enter your name'; return; }

    continueBtn.disabled = true;
    continueBtn.textContent = '...';

    const { error } = await supabase.from('users').upsert({
      id: getUserId(),
      name,
      avatar_url: getAvatarUrl() || null,
    });

    if (error) {
      errorEl.textContent = 'something went wrong';
      continueBtn.disabled = false;
      continueBtn.textContent = 'CONTINUE';
      return;
    }

    setUserName(name);
    navigateTo('lobby');
  });
}

async function resizeImage(file: File, size: number): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
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
  if (document.getElementById('login-styles')) return;
  const style = document.createElement('style');
  style.id = 'login-styles';
  style.textContent = `
    .login-screen {
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
    }

    .login-title {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 10px;
      letter-spacing: .4em;
      opacity: .4;
    }

    .login-avatar-wrap { display: flex; flex-direction: column; align-items: center; gap: 8px; }

    .login-avatar {
      width: 80px;
      height: 80px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.18);
      display: grid;
      place-items: center;
      cursor: pointer;
      overflow: hidden;
      transition: opacity 200ms ease;
      font-size: 24px;
      opacity: 0.6;
    }

    .login-avatar:hover { opacity: 1; }
    .login-avatar img { width: 100%; height: 100%; object-fit: cover; }

    .login-input {
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

    .login-input::placeholder { opacity: 0.3; }
    .login-input:focus { border-color: rgba(255,255,255,0.35); }

    .login-btn {
      border: 1px solid rgba(255,255,255,0.18);
      background: transparent;
      color: white;
      font-size: 11px;
      letter-spacing: .2em;
      padding: 13px 36px;
      border-radius: 999px;
      cursor: pointer;
      transition: opacity 200ms ease;
      margin-top: 8px;
    }

    .login-btn:hover { opacity: 0.7; }
    .login-btn:disabled { opacity: 0.3; cursor: default; }

    .login-error {
      font-size: 11px;
      color: rgba(255,80,80,0.85);
      min-height: 16px;
    }
  `;
  document.head.appendChild(style);
}
