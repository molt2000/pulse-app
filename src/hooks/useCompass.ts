const ALPHA = 0.12;

type HeadingCb = (heading: number) => void;

export class CompassManager {
  private _heading  = 0;
  private _active   = false;
  private sinAcc    = 0;
  private cosAcc    = 0;
  private hasFirst  = false;
  private gotAbs    = false;
  private readonly subs = new Set<HeadingCb>();

  readonly supported = 'DeviceOrientationEvent' in window;

  get heading(): number  { return this._heading; }
  get active():  boolean { return this._active; }

  get needsPermission(): boolean {
    return typeof (DeviceOrientationEvent as any).requestPermission === 'function';
  }

  async enable(): Promise<boolean> {
    if (!this.supported) return false;
    if (this._active)    return true;

    if (this.needsPermission) {
      try {
        const result = await (DeviceOrientationEvent as any).requestPermission();
        if (result !== 'granted') return false;
      } catch {
        return false;
      }
    }

    window.addEventListener('deviceorientationabsolute', this.onEvent as EventListener, true);
    window.addEventListener('deviceorientation',         this.onEvent,                   true);
    this._active = true;
    return true;
  }

  disable(): void {
    window.removeEventListener('deviceorientationabsolute', this.onEvent as EventListener, true);
    window.removeEventListener('deviceorientation',         this.onEvent,                   true);
    this._active  = false;
    this.hasFirst = false;
    this.gotAbs   = false;
  }

  subscribe(cb: HeadingCb): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  private readonly onEvent = (e: DeviceOrientationEvent): void => {
    if ((e as Event).type === 'deviceorientationabsolute') {
      this.gotAbs = true;
    } else if (this.gotAbs) {
      return;
    }

    const raw: number | null =
      typeof (e as any).webkitCompassHeading === 'number'
        ? (e as any).webkitCompassHeading
        : e.alpha !== null
          ? (360 - e.alpha) % 360
          : null;

    if (raw === null) return;

    const rad = (raw * Math.PI) / 180;
    if (!this.hasFirst) {
      this.sinAcc   = Math.sin(rad);
      this.cosAcc   = Math.cos(rad);
      this.hasFirst = true;
    } else {
      this.sinAcc += (Math.sin(rad) - this.sinAcc) * ALPHA;
      this.cosAcc += (Math.cos(rad) - this.cosAcc) * ALPHA;
    }

    this._heading = ((Math.atan2(this.sinAcc, this.cosAcc) * 180) / Math.PI + 360) % 360;
    this.subs.forEach(cb => cb(this._heading));
  };
}
