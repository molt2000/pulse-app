import { initAuth, isProfileComplete, getCurrentRoomId } from './auth';

export type Screen = 'permission' | 'lobby' | 'main';

export async function navigateTo(screen: Screen): Promise<void> {
  const app = document.getElementById('app')!;
  app.innerHTML = '';

  if (screen === 'permission') {
    const { mountPermissionScreen } = await import('./screens/PermissionScreen');
    mountPermissionScreen(app);
  } else if (screen === 'lobby') {
    const { mountLobbyScreen } = await import('./screens/LobbyScreen');
    mountLobbyScreen(app);
  } else if (screen === 'main') {
    const { mountMainScreen } = await import('./screens/MainScreen');
    mountMainScreen(app);
  }
}

async function boot(): Promise<void> {
  await initAuth();

  let permissionGranted = false;
  try {
    const result = await navigator.permissions.query({ name: 'geolocation' });
    permissionGranted = result.state === 'granted';
  } catch {
    permissionGranted = false;
  }

  if (!permissionGranted) {
    navigateTo('permission');
    return;
  }

  if (getCurrentRoomId()) {
    navigateTo('main');
    return;
  }

  navigateTo('lobby');
}

boot();
