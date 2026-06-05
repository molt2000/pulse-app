import { supabase } from './supabase';
import { distanceMeters, densityFromDistance, bearingDegrees, colorIdxFromUserId, stableIdFromUserId } from '../core/geo';
import type { Friend } from '../user';

export class PresenceService {
  private watchId:      number | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private lat:          number | null = null;
  private lng:          number | null = null;
  private ghost = false;
  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      void this.poll();
      this.startPoll();
    } else {
      this.stopPoll();
    }
  };

  constructor(
    private readonly roomId:    string,
    private readonly userId:    string,
    private readonly onFriends: (friends: Friend[]) => void,
    private readonly onGpsError: () => void,
  ) {}

  start(): void {
    this.startTracking();
    this.startPoll();
    void this.poll();
  }

  stop(): void {
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.stopPoll();
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  async setGhost(ghost: boolean): Promise<void> {
    this.ghost = ghost;
    const { error: ghostError } = await supabase
      .from('room_members')
      .update({ is_ghost: ghost })
      .eq('room_id', this.roomId)
      .eq('user_id', this.userId);
    if (ghostError) console.error('[Pulse] ghost update:', ghostError);

    if (ghost) {
      const { error: locationDeleteError } = await supabase
        .from('locations')
        .delete()
        .eq('user_id', this.userId);
      if (locationDeleteError) console.error('[Pulse] ghost location delete:', locationDeleteError);
    }
  }

  async pushLocation(): Promise<void> {
    if (this.lat === null || this.lng === null || this.ghost) return;
    const { error: locError } = await supabase.from('locations').upsert({
      user_id:    this.userId,
      room_id:    this.roomId,
      lat:        this.lat,
      lng:        this.lng,
      updated_at: new Date().toISOString(),
    });
    if (locError) console.error('[Pulse] location upsert:', locError);

    const { error: roomError } = await supabase
      .from('rooms')
      .update({ last_activity: new Date().toISOString() })
      .eq('id', this.roomId);
    if (roomError) console.error('[Pulse] room activity update:', roomError);
  }

  private startTracking(): void {
    if (!navigator.geolocation) return;
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.lat = pos.coords.latitude;
        this.lng = pos.coords.longitude;
        if (!this.ghost) void this.pushLocation();
      },
      (err) => {
        console.warn('[Pulse] GPS error:', err);
        this.onGpsError();
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    );
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private startPoll(): void {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(() => void this.poll(), 3000);
  }

  private stopPoll(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  async poll(): Promise<void> {
    if (import.meta.env.DEV) return;
    if (this.lat === null || this.lng === null) return;
    await this.pushLocation();

    const { data: members } = await supabase
      .from('room_members')
      .select('user_id, is_ghost')
      .eq('room_id', this.roomId)
      .eq('is_ghost', false)
      .neq('user_id', this.userId);

    if (!members || members.length === 0) {
      this.onFriends([]);
      return;
    }

    const memberIds = members.map((m: { user_id: string }) => m.user_id);

    const { data: locs } = await supabase
      .from('locations')
      .select('user_id, lat, lng, updated_at, users(name, avatar_url)')
      .in('user_id', memberIds);

    const myLat = this.lat!;
    const myLng = this.lng!;
    const now = Date.now();
    const friends: Friend[] = [];

    locs?.forEach((loc: any) => {
      const lastSeen = new Date(loc.updated_at).getTime();
      if (now - lastSeen > 30000) return;

      const user = loc.users;
      if (!user) return;

      const dist     = distanceMeters(myLat, myLng, loc.lat, loc.lng);
      const density  = densityFromDistance(dist);
      const bearing  = bearingDegrees(myLat, myLng, loc.lat, loc.lng);
      const colorIdx = colorIdxFromUserId(loc.user_id);

      friends.push({
        id:        stableIdFromUserId(loc.user_id),
        name:      user.name,
        avatarUrl: user.avatar_url ?? null,
        density,
        bearing,
        colorIdx,
        active: true,
      });
    });

    this.onFriends(friends);
  }
}
