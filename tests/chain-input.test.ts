import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPhysics } from '../lib/walky/physics';
import {
  ChainPinch,
  fitChainDistance,
  relativeTilt,
  startDeviceTilt,
  type TiltState,
} from '../lib/walky/chain-input';

void test('pinch scales from its starting distance, stays bounded, and never turns the remaining finger into a drag', () => {
  const pinch = new ChainPinch();
  pinch.start(1, { x: 0, y: 0 }, 1);
  assert.equal(pinch.blocksDrag, false);
  assert.equal(pinch.move(1, { x: 0, y: 0 }), null);
  pinch.start(2, { x: 100, y: 0 }, 1);
  assert.equal(pinch.blocksDrag, true);
  assert.equal(pinch.move(2, { x: 200, y: 0 }), 2);
  assert.equal(pinch.move(2, { x: 300, y: 0 }), 3);
  assert.equal(pinch.move(2, { x: 1000, y: 0 }), 3);
  assert.equal(pinch.move(2, { x: 10, y: 0 }), 0.65);
  pinch.start(3, { x: 500, y: 0 }, 1);
  assert.equal(pinch.move(3, { x: 1000, y: 0 }), null);
  pinch.end(3);
  assert.equal(pinch.blocksDrag, true);
  pinch.end(2);
  assert.equal(pinch.move(1, { x: 50, y: 0 }), null);
  assert.equal(pinch.blocksDrag, true);
  pinch.end(1);
  assert.equal(pinch.blocksDrag, false);
  pinch.start(1, { x: 0, y: 0 }, 2);
  pinch.start(2, { x: 100, y: 0 }, 2);
  assert.equal(pinch.move(2, { x: 50, y: 0 }), 1);
  pinch.reset();
  assert.equal(pinch.blocksDrag, false);
  assert.equal(pinch.move(2, { x: 0, y: 0 }), null);
});

void test('camera frames a short chain much closer while fitting both portrait and landscape bounds', () => {
  const height = 3.5,
    width = 1.5,
    fov = (33 * Math.PI) / 360;
  for (const aspect of [0.78, 2.8]) {
    const distance = fitChainDistance(width, height, aspect);
    assert.ok(distance < 8);
    const visibleHeight = 2 * distance * Math.tan(fov);
    assert.ok(visibleHeight * 0.8 >= height);
    assert.ok(visibleHeight * aspect * 0.8 >= width);
  }
  assert.ok(fitChainDistance(9.5, 5, 0.78) > fitChainDistance(9.5, 5, 2.8));
});

void test('relative tilt calibrates to how the phone is held and maps landscape axes', () => {
  assert.deepEqual(
    relativeTilt(
      { beta: 50, gamma: 8, angle: 0 },
      { beta: 50, gamma: 8, angle: 0 },
    ),
    { x: 0, y: 0 },
  );
  assert.deepEqual(
    relativeTilt(
      { beta: 50, gamma: 43, angle: 0 },
      { beta: 50, gamma: 8, angle: 0 },
    ),
    { x: 1, y: 0 },
  );
  const landscape = relativeTilt(
    { beta: 35, gamma: 0, angle: 90 },
    { beta: 0, gamma: 0, angle: 90 },
  );
  assert.equal(landscape.x, 1);
  assert.ok(Math.abs(landscape.y) < 0.0001);
  const wrapped = relativeTilt(
    { beta: -179, gamma: 0, angle: 0 },
    { beta: 179, gamma: 0, angle: 0 },
  );
  assert.ok(Math.abs(wrapped.y - 2 / 35) < 0.0001);
});

const orientation = (
  events: EventTarget,
  beta: number | null,
  gamma: number | null,
) => {
  const event = new Event('deviceorientation');
  Object.assign(event, { beta, gamma });
  events.dispatchEvent(event);
};
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

void test('parallel and repeated scene mounts share physics initialization without invalidating an existing world', async () => {
  const first = loadPhysics(),
    second = loadPhysics();
  assert.equal(first, second);
  const physics = await first;
  const world = new physics.World({ x: 0, y: -9.81, z: 0 });
  const body = world.createRigidBody(physics.RigidBodyDesc.dynamic());
  world.createCollider(physics.ColliderDesc.ball(0.2), body);
  await loadPhysics();
  world.step();
  assert.ok(body.translation().y < 0);
  world.free();
});

void test('device tilt starts only after permission, ignores null samples, recalibrates after rotation, and cleans up', async () => {
  const events = new EventTarget(),
    states: TiltState[] = [],
    points: { x: number; y: number }[] = [];
  let permissionRequested = false,
    angle = 0;
  const stop = startDeviceTilt(
    (p) => points.push(p),
    (s) => states.push(s),
    {
      events,
      secure: true,
      available: true,
      angle: () => angle,
      requestPermission: () => {
        permissionRequested = true;
        return Promise.resolve('granted');
      },
    },
  );
  assert.equal(permissionRequested, true);
  orientation(events, 45, 0);
  assert.equal(points.length, 0);
  await tick();
  orientation(events, null, null);
  assert.deepEqual(states, ['waiting']);
  orientation(events, 45, 0);
  assert.deepEqual(states, ['waiting', 'active']);
  orientation(events, 45, 35);
  assert.deepEqual(points.at(-1), { x: 1, y: 0 });
  angle = 90;
  orientation(events, 70, -20);
  assert.deepEqual(points.at(-1), { x: 0, y: 0 });
  stop();
  const count = points.length;
  orientation(events, 20, 20);
  assert.equal(points.length, count);
  assert.deepEqual(points.at(-1), { x: 0, y: 0 });
});

void test('denied, missing, silent, and cancelled sensors never claim that tilt is active', async () => {
  for (const result of [
    'denied',
    'cancelled',
    'silent',
    'missing',
    'insecure',
    'rejected',
  ] as const) {
    const events = new EventTarget(),
      states: TiltState[] = [];
    const stop = startDeviceTilt(
      () => {},
      (s) => states.push(s),
      {
        events,
        secure: result !== 'insecure',
        available: result !== 'missing',
        angle: () => 0,
        timeoutMs: 5,
        requestPermission: () =>
          result === 'rejected'
            ? Promise.reject(new Error('Denied'))
            : Promise.resolve(result === 'denied' ? 'denied' : 'granted'),
      },
    );
    if (result === 'cancelled') stop();
    await new Promise((resolve) => setTimeout(resolve, 12));
    orientation(events, 30, 15);
    assert.ok(!states.includes('active'), result);
    if (result === 'silent' || result === 'missing' || result === 'insecure')
      assert.equal(states.at(-1), 'unavailable');
    if (result === 'denied' || result === 'rejected')
      assert.equal(states.at(-1), 'denied');
    stop();
  }
});
