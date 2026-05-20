import { friends } from './state';
import { PulseRenderer } from './visuals/renderer';

document.title = 'Pulse';

const app = document.getElementById('app');
if (!app) throw new Error('Missing #app root.');

const renderer = new PulseRenderer(app, friends);
renderer.startRendering();

const debugPanel = createDebugPanel();
document.body.appendChild(debugPanel.panel);
document.body.appendChild(debugPanel.trigger);

function createDebugPanel(): { panel: HTMLDivElement; trigger: HTMLButtonElement } {
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

    const value = document.createElement('output');
    value.id = `density-${friend.id}`;
    value.textContent = `${density.value}%`;

    const bearing = document.createElement('input');
    bearing.type = 'range';
    bearing.min = '0';
    bearing.max = '359';
    bearing.value = String(friend.bearing);
    bearing.dataset.id = String(friend.id);
    bearing.dataset.field = 'bearing';

    row.append(name, density, value, bearing);
    panel.appendChild(row);
  }

  panel.addEventListener('input', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;

    const friend = friends.find((item) => item.id === Number(input.dataset.id));
    if (!friend) return;

    if (input.dataset.field === 'density') {
      friend.density = Number(input.value) / 100;
      const value = document.getElementById(`density-${friend.id}`);
      if (value) value.textContent = `${input.value}%`;
    }

    if (input.dataset.field === 'bearing') {
      friend.bearing = Number(input.value);
    }

    renderer.refreshFriendUi();
  });

  const trigger = document.createElement('button');
  trigger.className = 'pulse-debug-trigger';
  trigger.type = 'button';
  trigger.textContent = 'D';
  trigger.setAttribute('aria-label', 'Toggle proximity controls');

  const toggle = (): void => {
    panel.classList.toggle('is-open');
  };
  trigger.addEventListener('click', toggle);
  window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'd') toggle();
  });

  injectDebugStyles();

  return { panel, trigger };
}

function injectDebugStyles(): void {
  const style = document.createElement('style');
  style.textContent = `
    .pulse-debug-panel {
      position: fixed;
      right: max(14px, env(safe-area-inset-right));
      top: 50%;
      z-index: 20;
      width: min(320px, calc(100vw - 28px));
      padding: 14px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      background: rgba(7, 8, 9, 0.72);
      box-shadow: 0 22px 70px rgba(0, 0, 0, 0.38);
      backdrop-filter: blur(18px);
      opacity: 0;
      pointer-events: none;
      transform: translate3d(0, -46%, 0) scale(0.98);
      transition: opacity 220ms ease, transform 220ms ease;
    }

    .pulse-debug-panel.is-open {
      opacity: 1;
      pointer-events: auto;
      transform: translate3d(0, -50%, 0) scale(1);
    }

    .pulse-debug-title {
      margin-bottom: 12px;
      color: rgba(246, 242, 232, 0.46);
      font: 680 10px/1 system-ui, sans-serif;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }

    .pulse-debug-row {
      display: grid;
      grid-template-columns: 56px 1fr 38px 1fr;
      align-items: center;
      gap: 8px;
      margin-top: 9px;
      color: rgba(246, 242, 232, 0.72);
      font: 560 11px/1.2 system-ui, sans-serif;
    }

    .pulse-debug-row output {
      color: rgba(246, 242, 232, 0.42);
      font-variant-numeric: tabular-nums;
      text-align: right;
    }

    .pulse-debug-row input {
      width: 100%;
      accent-color: #ded7c6;
    }

    .pulse-debug-trigger {
      position: fixed;
      left: 50%;
      bottom: max(16px, env(safe-area-inset-bottom));
      z-index: 22;
      width: 34px;
      height: 34px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.045);
      color: rgba(246, 242, 232, 0.28);
      font: 700 10px/1 system-ui, sans-serif;
      transform: translateX(-50%);
      backdrop-filter: blur(12px);
      cursor: pointer;
    }

    @media (max-width: 620px) {
      .pulse-debug-panel {
        right: 14px;
        left: 14px;
        top: auto;
        bottom: 62px;
        width: auto;
        transform: translate3d(0, 12px, 0) scale(0.98);
      }

      .pulse-debug-panel.is-open {
        transform: translate3d(0, 0, 0) scale(1);
      }

      .pulse-debug-row {
        grid-template-columns: 52px 1fr 34px 1fr;
      }
    }
  `;
  document.head.appendChild(style);
}
