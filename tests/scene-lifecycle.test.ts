import { test } from 'node:test';
import assert from 'node:assert/strict';
import { animationLoop } from '../lib/walky/animation-loop';
import {
  paperGeometry,
  updatePaperGeometry,
} from '../lib/walky/paper-geometry';

void test('hidden scenes cancel all frames and resume without a background catch-up burst', () => {
  let now = 0,
    id = 0;
  const queued = new Map<number, FrameRequestCallback>();
  const deltas: number[] = [];
  const loop = animationLoop((_time, delta) => deltas.push(delta), {
    request(callback) {
      queued.set(++id, callback);
      return id;
    },
    cancel(handle) {
      queued.delete(handle);
    },
    now: () => now,
  });
  const step = (time: number) => {
    now = time;
    const batch = [...queued.values()];
    queued.clear();
    batch.forEach((callback) => callback(time));
  };
  loop.setActive(true);
  loop.setActive(true);
  assert.equal(queued.size, 1);
  step(16);
  assert.equal(deltas[0], 0.016);
  loop.setActive(false);
  assert.equal(queued.size, 0);
  step(60000);
  assert.equal(deltas.length, 1);
  loop.setActive(true);
  step(60016);
  assert.equal(deltas[1], 0.016);
  step(61000);
  assert.equal(deltas[2], 0.05); // A stalled frame cannot trigger unbounded physics work.
  loop.setActive(false);
  assert.equal(queued.size, 0);
});

void test('paper folding keeps the same GPU attributes and finite geometry throughout the animation', () => {
  const geometry = paperGeometry(0);
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const index = geometry.getIndex();
  let disposals = 0;
  geometry.addEventListener('dispose', () => disposals++);
  assert.ok(Math.abs(position.getX(0)) > 1.4);
  for (let frame = 0; frame <= 100; frame++) {
    updatePaperGeometry(geometry, frame / 100, Math.sin(frame) * 0.014);
    assert.equal(geometry.getAttribute('position'), position);
    assert.equal(geometry.getAttribute('normal'), normal);
    assert.equal(geometry.getIndex(), index);
    assert.ok(position.array.every(Number.isFinite));
    assert.ok(normal.array.every(Number.isFinite));
  }
  assert.ok(Math.abs(position.getX(0)) < 0.001);
  assert.equal(disposals, 0);
  geometry.dispose();
});
