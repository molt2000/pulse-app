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
