export interface Friend {
  id: number;
  name: string;
  avatarUrl?: string | null;
  density: number;
  bearing: number;
  colorIdx: number;
  active: boolean;
}

export interface ViewportSize { width: number; height: number; }
