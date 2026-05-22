import { navigateTo } from '../main';

export function mountPermissionScreen(app: HTMLElement): void {
  app.innerHTML = `
    <div class="perm-screen">
      <div class="perm-title">PULSE</div>
      <div class="perm-pulse-ring"></div>
      <div class="perm-text">to find your friends,<br>pulse needs your location</div>
      <button class="perm-btn" id="allow-btn">ALLOW LOCATION</button>
      <div class="perm-error" id="perm-error"></div>
    </div>
  `;

  injectStyles();

  document.getElementById('allow-btn')!.addEventListener('click', async () => {
    const error = document.getElementById('perm-error')!;
    const btn = document.getElementById('allow-btn') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = '...';

    try {
      await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });
      navigateTo('lobby');
    } catch {
      error.textContent = 'location required to use pulse';
      btn.textContent = 'ALLOW LOCATION';
      btn.disabled = false;
    }
  });
}

function injectStyles(): void {
  if (document.getElementById('perm-styles')) return;
  const style = document.createElement('style');
  style.id = 'perm-styles';
  style.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #020304;
      color: white;
      font-family: Inter, system-ui, sans-serif;
      overflow: hidden;
    }

    .perm-screen {
      position: fixed;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 28px;
      background:
        repeating-linear-gradient(0deg, rgba(180,20,20,0.10) 0px, transparent 1px, transparent 60px),
        repeating-linear-gradient(90deg, rgba(180,20,20,0.10) 0px, transparent 1px, transparent 60px),
        #020304;
    }

    .perm-title {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 10px;
      letter-spacing: .4em;
      opacity: .4;
    }

    .perm-pulse-ring {
      width: 80px;
      height: 80px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.15);
      animation: pulse-ring 2s ease-in-out infinite;
    }

    @keyframes pulse-ring {
      0%, 100% { transform: scale(1); opacity: 0.15; }
      50% { transform: scale(1.15); opacity: 0.4; }
    }

    .perm-text {
      font-size: 13px;
      opacity: 0.45;
      text-align: center;
      line-height: 1.7;
      letter-spacing: 0.02em;
    }

    .perm-btn {
      border: 1px solid rgba(255,255,255,0.18);
      background: transparent;
      color: white;
      font-size: 11px;
      letter-spacing: .2em;
      padding: 13px 36px;
      border-radius: 999px;
      cursor: pointer;
      transition: opacity 200ms ease;
    }

    .perm-btn:hover { opacity: 0.7; }
    .perm-btn:disabled { opacity: 0.3; cursor: default; }

    .perm-error {
      font-size: 11px;
      color: rgba(255,80,80,0.85);
      letter-spacing: 0.02em;
      min-height: 16px;
    }
  `;
  document.head.appendChild(style);
}
