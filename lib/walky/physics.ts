async function initialize() {
  const physics = (await import('@dimforge/rapier3d-compat')).default;
  await physics.init();
  return physics;
}

let ready: ReturnType<typeof initialize> | undefined;

// Reinitializing the WASM module invalidates worlds that are still alive.
// Share one initialization across Strict Mode, tab changes, and hot reloads.
export function loadPhysics() {
  return (ready ??= initialize());
}
