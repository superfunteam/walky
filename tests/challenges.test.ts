import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  challengeProgress,
  nextReward,
  type ChallengeDefinition,
} from '../lib/walky/challenges';
import {
  archiveChallenge,
  challengeFeed,
  claimReward,
  completeChallengeItem,
  createChallenge,
} from '../server/challenges';
import { createApi } from '../server/api';
import { keys } from '../server/core';
import type { Store } from '../server/store';

class MemoryStore implements Store {
  data = new Map<string, unknown>();
  async get<T>(key: string) {
    return (this.data.get(key) ?? null) as T | null;
  }
  async set(key: string, value: unknown, onlyIfNew = false) {
    if (onlyIfNew && this.data.has(key)) return false;
    this.data.set(key, value);
    return true;
  }
  async remove(key: string) {
    this.data.delete(key);
  }
  async list(prefix: string) {
    return [...this.data.keys()].filter((key) => key.startsWith(prefix));
  }
}
const cfg = {
  token: 'streaker-test-connection-code-1234567890',
  timezone: 'America/Chicago',
};
const now = new Date('2026-09-09T02:00:00Z'); // Still September 8 in Chicago.
const definition = (target = 3): ChallengeDefinition => ({
  id: randomUUID(),
  kind: 'streak',
  target,
  reward: 'Breakfast in bed',
  items: [],
  startsOn: '2026-09-08',
  createdAt: now.toISOString(),
});

void test('streak challenges count only eligible consecutive days, reset after a gap, and remember a completed run', () => {
  const d = definition();
  let c = challengeProgress(
    d,
    ['2026-09-07', '2026-09-08', '2026-09-09'],
    '2026-09-09',
  );
  assert.equal(c.progress, 2);
  assert.equal(c.unlocked, false);
  c = challengeProgress(
    d,
    ['2026-09-08', '2026-09-09', '2026-09-12'],
    '2026-09-11',
  );
  assert.equal(c.progress, 0);
  assert.equal(c.bestStreak, 2);
  c = challengeProgress(d, ['2026-09-08', '2026-09-09'], '2026-09-10');
  assert.equal(c.progress, 2); // Today's walk can still continue yesterday's run.
  c = challengeProgress(
    d,
    ['2026-09-08', '2026-09-09', '2026-09-10'],
    '2026-09-15',
  );
  assert.equal(c.unlocked, true);
  assert.equal(c.progress, 3);
  assert.equal(c.unlockedOn, '2026-09-10');
  c = challengeProgress(d, ['2026-09-08', '2026-09-10'], '2026-09-15');
  assert.equal(c.unlocked, false); // Undo corrects a run before a reward is collected.
});

void test('same-day checklist walks stay distinct, concurrent taps count once, and the daily calendar stays singular', async () => {
  const store = new MemoryStore(),
    id = randomUUID();
  await createChallenge(
    store,
    cfg,
    {
      id,
      kind: 'checklist',
      reward: 'No dishes tonight',
      items: ['Any walk', 'Any walk', 'Lakeside after dark'],
    },
    now,
  );
  await Promise.all(
    Array.from({ length: 8 }, () =>
      completeChallengeItem(store, cfg, id, '0', true, now),
    ),
  );
  let feed = await challengeFeed(store, cfg, now);
  assert.equal(feed.challenges[0].progress, 1);
  assert.equal((await store.list('walk/')).length, 1);
  assert.equal((await store.list('challenge-item/')).length, 1);
  await completeChallengeItem(
    store,
    cfg,
    id,
    '0',
    true,
    new Date('2026-09-10T02:00:00Z'),
  );
  assert.equal((await store.list('walk/')).length, 1); // A later retry isn't a new walk.
  await completeChallengeItem(store, cfg, id, '1', true, now);
  await completeChallengeItem(store, cfg, id, '2', true, now);
  feed = await challengeFeed(store, cfg, now);
  assert.equal(feed.challenges[0].progress, 3);
  assert.equal(feed.challenges[0].unlockedOn, '2026-09-08');
  assert.equal((await store.list('walk/')).length, 1);
  await completeChallengeItem(store, cfg, id, '1', false, now);
  assert.equal(
    (await challengeFeed(store, cfg, now)).challenges[0].unlocked,
    false,
  );
  assert.equal((await store.list('walk/')).length, 1);
});

void test('reward collection is gated and idempotent; retiring a deal does not erase walks', async () => {
  const store = new MemoryStore(),
    id = randomUUID();
  await createChallenge(
    store,
    cfg,
    { id, kind: 'checklist', reward: 'Date night', items: ['Mall walk'] },
    now,
  );
  await assert.rejects(claimReward(store, cfg, id, now), /more walks/);
  await completeChallengeItem(store, cfg, id, '0', true, now);
  await Promise.all([
    claimReward(store, cfg, id, now),
    claimReward(store, cfg, id, now),
  ]);
  const feed = await challengeFeed(store, cfg, now);
  assert.equal(feed.challenges[0].claimedAt, now.toISOString());
  assert.equal(feed.nextReward, null);
  assert.equal((await store.list('challenge-claim/')).length, 1);
  await assert.rejects(
    completeChallengeItem(store, cfg, id, '0', false, now),
    /already been claimed/,
  );
  await archiveChallenge(store, cfg, id, now);
  assert.equal((await challengeFeed(store, cfg, now)).challenges.length, 0);
  assert.equal((await store.list('walk/')).length, 1);
});

void test('next reward prefers an earned unclaimed prize, then the closest challenge', () => {
  const a = challengeProgress(definition(5), ['2026-09-08'], '2026-09-08');
  const b = challengeProgress(definition(2), ['2026-09-08'], '2026-09-08');
  const ready = challengeProgress(definition(1), ['2026-09-08'], '2026-09-08');
  assert.equal(nextReward([]), null);
  assert.equal(nextReward([a, b])?.id, b.id);
  assert.equal(nextReward([a, ready, b])?.id, ready.id);
  assert.equal(
    nextReward([{ ...ready, claimedAt: now.toISOString() }, b])?.id,
    b.id,
  );
});

void test('challenge creation validates limits and a retried request creates only one deal', async () => {
  const store = new MemoryStore(),
    id = randomUUID();
  const input = { id, kind: 'streak', reward: 'Breakfast in bed', target: 7 };
  await Promise.all([
    createChallenge(store, cfg, input, now),
    createChallenge(store, cfg, input, now),
  ]);
  assert.equal((await store.list('challenge/')).length, 1);
  await assert.rejects(
    createChallenge(store, cfg, { ...input, reward: 'Different reward' }, now),
    /already exists/,
  );
  for (const value of [0, -1, 1.5, 366])
    await assert.rejects(
      createChallenge(
        store,
        cfg,
        { ...input, id: randomUUID(), target: value },
        now,
      ),
    );
  for (const items of [[], [''], Array.from({ length: 31 }, () => 'Walk')])
    await assert.rejects(
      createChallenge(
        store,
        cfg,
        { kind: 'checklist', reward: 'Prize', items },
        now,
      ),
    );
  await assert.rejects(
    createChallenge(store, cfg, { ...input, reward: ' ' }, now),
  );
});

void test('private challenge and next-reward routes reject anonymous, calendar-read, and log-only access', async () => {
  const store = new MemoryStore(),
    api = createApi(store, cfg),
    scopes = keys(cfg.token);
  const request = (
    path: string,
    token?: string,
    method = 'GET',
    body?: unknown,
    origin?: string,
  ) =>
    new Request(`https://walky.example${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(origin ? { Origin: origin } : {}),
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  for (const route of ['/api/challenges', '/api/rewards/next']) {
    assert.equal((await api(request(route))).status, 401);
    for (const key of [scopes.read, scopes.log, 'wrong'])
      assert.equal((await api(request(route, key))).status, 403);
  }
  assert.equal(
    (await api(request('/api/challenges', scopes.reward))).status,
    403,
  );
  assert.equal((await api(request('/api/status', scopes.reward))).status, 403);
  assert.deepEqual(
    await (await api(request('/api/rewards/next', scopes.reward))).json(),
    { nextReward: null },
  );
  const input = {
    kind: 'checklist',
    reward: 'Private team prize',
    items: ['Mall walk'],
  };
  assert.equal(
    (
      await api(
        request(
          '/api/challenges',
          cfg.token,
          'POST',
          input,
          'https://evil.example',
        ),
      )
    ).status,
    403,
  );
  assert.equal(
    (await api(request('/api/challenges', scopes.reward, 'POST', input)))
      .status,
    403,
  );
  const created = await api(
    request('/api/challenges', cfg.token, 'POST', input),
  );
  assert.equal(created.status, 201);
  const feed = await created.json();
  const id = feed.challenges[0].id;
  for (const route of [
    `/api/challenges/${id}/items/0`,
    `/api/challenges/${id}/claim`,
    `/api/challenges/${id}`,
  ]) {
    for (const key of [undefined, scopes.read, scopes.log, scopes.reward]) {
      const response = await api(
        request(route, key, route.endsWith(id) ? 'DELETE' : 'POST'),
      );
      assert.ok([401, 403].includes(response.status));
    }
  }
  const next = await api(request('/api/rewards/next', scopes.reward));
  assert.equal((await next.json()).nextReward.reward, 'Private team prize');
  assert.equal(next.headers.get('Cache-Control'), 'no-store');
  assert.equal((await store.list('walk/')).length, 0);
});
