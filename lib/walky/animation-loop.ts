type Scheduler = {
  request: (callback: FrameRequestCallback) => number;
  cancel: (id: number) => void;
  now: () => number;
};

// Pausing cancels the frame entirely. Resuming never simulates time spent hidden.
export function animationLoop(
  draw: (now: number, delta: number) => void,
  scheduler: Scheduler = {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (id) => cancelAnimationFrame(id),
    now: () => performance.now(),
  },
) {
  let active = false,
    handle = 0,
    previous = 0;
  const frame = (now: number) => {
    if (!active) return;
    const delta = Math.min(Math.max(0, now - previous) / 1000, 0.05);
    previous = now;
    draw(now, delta);
    if (active) handle = scheduler.request(frame);
  };
  return {
    setActive(value: boolean) {
      if (active === value) return;
      active = value;
      if (active) {
        previous = scheduler.now();
        handle = scheduler.request(frame);
      } else scheduler.cancel(handle);
    },
  };
}
