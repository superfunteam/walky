export const MIN_ZOOM = 0.65;
export const MAX_ZOOM = 3;
export const clampZoom = (value: number) =>
  Number.isFinite(value) ? Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value)) : 1;

export function fitChainDistance(
  width: number,
  height: number,
  aspect: number,
) {
  const halfFov = (33 * Math.PI) / 360;
  return Math.max(
    4,
    Math.max(height, width / Math.max(0.1, aspect)) /
      (2 * Math.tan(halfFov) * 0.8),
  );
}

type Point = { x: number; y: number };
export class ChainPinch {
  private points = new Map<number, Point>();
  private startDistance = 1;
  private startZoom = 1;
  blocksDrag = false;

  start(id: number, point: Point, zoom: number) {
    if (this.points.size >= 2) return;
    this.points.set(id, point);
    if (this.points.size === 2) {
      this.blocksDrag = true;
      this.startDistance = this.distance();
      this.startZoom = zoom;
    }
  }

  move(id: number, point: Point) {
    if (!this.points.has(id)) return null;
    this.points.set(id, point);
    return this.points.size === 2
      ? clampZoom((this.startZoom * this.distance()) / this.startDistance)
      : null;
  }

  end(id: number) {
    this.points.delete(id);
    // Keep the remaining finger from suddenly dragging a link after a pinch.
    if (this.points.size === 0) this.blocksDrag = false;
  }

  reset() {
    this.points.clear();
    this.blocksDrag = false;
  }

  private distance() {
    const [a, b] = [...this.points.values()];
    return Math.max(8, Math.hypot(a.x - b.x, a.y - b.y));
  }
}

export type TiltSample = { beta: number; gamma: number; angle: number };
const angleDelta = (value: number, base: number) =>
  ((value - base + 540) % 360) - 180;
export function relativeTilt(sample: TiltSample, neutral: TiltSample): Point {
  const beta = angleDelta(sample.beta, neutral.beta);
  const gamma = angleDelta(sample.gamma, neutral.gamma);
  const angle = (sample.angle * Math.PI) / 180;
  const limit = (n: number) => Math.max(-1, Math.min(1, n / 35));
  return {
    x: limit(gamma * Math.cos(angle) + beta * Math.sin(angle)),
    y: limit(beta * Math.cos(angle) - gamma * Math.sin(angle)),
  };
}

export type TiltState = 'waiting' | 'active' | 'denied' | 'unavailable';
type TiltEnvironment = {
  events: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  secure: boolean;
  available: boolean;
  angle: () => number;
  requestPermission?: () => Promise<string>;
  timeoutMs?: number;
};

export function startDeviceTilt(
  onTilt: (point: Point) => void,
  onState: (state: TiltState) => void,
  env: TiltEnvironment,
) {
  let cancelled = false;
  let listening = false;
  let neutral: TiltSample | null = null;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    cancelled = true;
    clearTimeout(timeout);
    if (listening) env.events.removeEventListener('deviceorientation', sample);
    onTilt({ x: 0, y: 0 });
  };
  const fail = (state: 'denied' | 'unavailable') => {
    if (cancelled) return;
    stop();
    onState(state);
  };
  const sample = (event: Event) => {
    const { beta, gamma } = event as DeviceOrientationEvent;
    if (
      beta === null ||
      gamma === null ||
      !Number.isFinite(beta) ||
      !Number.isFinite(gamma)
    )
      return;
    const current = { beta, gamma, angle: env.angle() };
    if (!neutral || neutral.angle !== current.angle) {
      neutral = current;
      clearTimeout(timeout);
      onState('active');
    }
    onTilt(relativeTilt(current, neutral));
  };
  if (!env.secure || !env.available) {
    fail('unavailable');
    return stop;
  }
  onState('waiting');
  try {
    // Invoke synchronously from the tap so Safari keeps user activation.
    const permission = env.requestPermission?.() ?? Promise.resolve('granted');
    void permission
      .then((result) => {
        if (cancelled) return;
        if (result !== 'granted') return fail('denied');
        env.events.addEventListener('deviceorientation', sample);
        listening = true;
        timeout = setTimeout(() => fail('unavailable'), env.timeoutMs ?? 3000);
      })
      .catch(() => fail('denied'));
  } catch {
    fail('denied');
  }
  return stop;
}
