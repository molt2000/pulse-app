import { supabase } from './supabase';

const USER_ID_KEY = 'pulse_user_id';
const USER_NAME_KEY = 'pulse_user_name';
const USER_AVATAR_KEY = 'pulse_avatar_url';

export async function initAuth(): Promise<string> {
  let userId = localStorage.getItem(USER_ID_KEY);

  if (!userId) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) throw new Error('Auth failed');
    userId = data.user.id;
    localStorage.setItem(USER_ID_KEY, userId);
  }

  return userId;
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
