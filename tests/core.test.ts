import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayInZone, offsetDay, summarize, validDay } from '../lib/walky/dates';
import { createApi } from '../server/api';
import { keys, logWalk } from '../server/core';
import { sendReminders } from '../server/reminders';
import { ROASTS, roastForDay } from '../server/roasts';
import type { Store } from '../server/store';
class MemoryStore implements Store {
  data = new Map<string, unknown>();
  async get<T>(k: string) {
    return (this.data.get(k) ?? null) as T | null;
  }
  async set(k: string, v: unknown, only = false) {
    if (only && this.data.has(k)) return false;
    this.data.set(k, v);
    return true;
  }
  async remove(k: string) {
    this.data.delete(k);
  }
  async list(p: string) {
    return [...this.data.keys()].filter((k) => k.startsWith(p));
  }
}
const cfg = {
  token: 'test-household-connection-code-1234567890',
  timezone: 'America/Chicago',
};
const req = (path: string, method = 'GET', body?: unknown, token = cfg.token) =>
  new Request('https://walky.example' + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
test('household dates handle midnight, DST, leap years and streak grace', () => {
  assert.equal(
    dayInZone(cfg.timezone, new Date('2026-09-09T01:00:00Z')),
    '2026-09-08',
  );
  assert.equal(
    dayInZone(cfg.timezone, new Date('2026-03-08T07:59:00Z')),
    '2026-03-08',
  );
  assert.equal(offsetDay('2024-03-01', -1), '2024-02-29');
  assert.equal(validDay('2026-02-30'), false);
  assert.equal(
    summarize(['2026-09-06', '2026-09-07'], '2026-09-08', cfg.timezone).streak,
    2,
  );
  assert.equal(
    summarize(['2026-09-05', '2026-09-06'], '2026-09-08', cfg.timezone).streak,
    0,
  );
  assert.equal(
    summarize(
      ['2026-09-07', '2026-09-07', '2026-09-08'],
      '2026-09-08',
      cfg.timezone,
    ).total,
    2,
  );
});
test('concurrent duplicate walk logs count once and preserve first timestamp', async () => {
  const store = new MemoryStore();
  await Promise.all(
    Array.from({ length: 12 }, () =>
      logWalk(store, cfg, '2026-09-08', new Date('2026-09-08T21:00:00Z')),
    ),
  );
  assert.equal((await store.list('walk/')).length, 1);
  await assert.rejects(
    logWalk(store, cfg, '2026-09-09', new Date('2026-09-08T21:00:00Z')),
  );
});
test('API authentication, scope isolation, date validation, undo and cookie connection', async () => {
  const store = new MemoryStore(),
    api = createApi(store, cfg),
    k = keys(cfg.token);
  assert.equal(
    (await api(req('/api/status', 'GET', undefined, 'wrong'))).status,
    403,
  );
  assert.equal(
    (await api(new Request('https://walky.example/api/status'))).status,
    401,
  );
  assert.equal(
    (await api(req('/api/walks', 'POST', { date: '2026-02-30' }))).status,
    400,
  );
  assert.equal((await api(req('/api/walks', 'POST', {}, k.read))).status, 403);
  assert.equal(
    (await api(req('/api/walks', 'DELETE', { date: '2026-09-01' }, k.log)))
      .status,
    403,
  );
  assert.equal(
    (await api(req('/api/log', 'GET', undefined, k.log))).status,
    200,
  );
  assert.equal(
    (await api(req('/api/status', 'GET', undefined, k.read))).status,
    200,
  );
  assert.equal(
    (await api(req('/api/settings', 'GET', undefined, k.read))).status,
    403,
  );
  const connection = await api(
    req('/api/household', 'POST', { token: cfg.token }),
  );
  assert.equal(connection.status, 200);
  assert.match(connection.headers.get('set-cookie')!, /HttpOnly; SameSite=Lax/);
  assert.equal(
    (await api(req('/api/walks', 'POST', { date: '2026-09-01' }))).status,
    200,
  );
  await api(req('/api/walks', 'DELETE', { date: '2026-09-01' }));
  assert.equal(await store.get('walk/2026-09-01'), null);
  const cross = new Request('https://walky.example/api/walks', {
    method: 'POST',
    headers: {
      Cookie: `walky=${cfg.token}`,
      Origin: 'https://evil.example',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  assert.equal((await api(cross)).status, 403);
});
const smsEnv = {
  CLARK: '+15555550101',
  ANGIE: '+15555550102',
  TEXBELT: 'not-a-real-key',
};
function sender() {
  const calls: RequestInit[] = [];
  return {
    calls,
    send: (async (_url: unknown, init?: RequestInit) => {
      calls.push(init!);
      return Response.json({ success: true, textId: String(calls.length) });
    }) as typeof fetch,
  };
}
test('4 pm Central fires at 21 UTC in summer and 22 UTC in winter', async () => {
  for (const iso of [
    '2026-09-08T21:00:00Z',
    '2026-01-08T22:00:00Z',
    '2026-03-08T21:00:00Z',
    '2026-11-01T22:00:00Z',
  ]) {
    const store = new MemoryStore(),
      mock = sender();
    const result = await sendReminders({
      store,
      env: smsEnv,
      now: new Date(iso),
      send: mock.send,
    });
    assert.equal(mock.calls.length, 2);
    assert.equal(result.results.length, 2);
  }
});
void test('Textbelt key supports either env spelling and preserves TEXBELT precedence', async () => {
  for (const credentials of [
    { TEXBELT: 'legacy-key' },
    { TEXTBELT: 'alias-key' },
    { TEXBELT: 'legacy-key', TEXTBELT: 'alias-key' },
  ]) {
    const mock = sender();
    await sendReminders({
      store: new MemoryStore(),
      env: { CLARK: smsEnv.CLARK, ANGIE: smsEnv.ANGIE, ...credentials },
      now: new Date('2026-09-08T21:00:00Z'),
      send: mock.send,
    });
    assert.equal(mock.calls.length, 2);
    for (const call of mock.calls)
      assert.equal(
        (call.body as URLSearchParams).get('key'),
        credentials.TEXBELT || credentials.TEXTBELT,
      );
  }
});
test('wrong UTC slot, completed walk and disabled SMS produce no sends', async () => {
  for (const iso of ['2026-09-08T22:00:00Z', '2026-01-08T21:00:00Z']) {
    const mock = sender();
    await sendReminders({
      store: new MemoryStore(),
      env: smsEnv,
      now: new Date(iso),
      send: mock.send,
    });
    assert.equal(mock.calls.length, 0);
  }
  const store = new MemoryStore(),
    mock = sender();
  await store.set('walk/2026-09-08', {});
  await sendReminders({
    store,
    env: smsEnv,
    now: new Date('2026-09-08T21:00:00Z'),
    send: mock.send,
  });
  assert.equal(mock.calls.length, 0);
  await sendReminders({
    store: new MemoryStore(),
    env: { ...smsEnv, SMS_ENABLED: 'false' },
    now: new Date('2026-09-08T21:00:00Z'),
    send: mock.send,
  });
  assert.equal(mock.calls.length, 0);
});
test('parallel reminder runs send only one text per person', async () => {
  const store = new MemoryStore(),
    mock = sender();
  await Promise.all(
    Array.from({ length: 6 }, () =>
      sendReminders({
        store,
        env: smsEnv,
        now: new Date('2026-09-08T21:00:00Z'),
        send: mock.send,
      }),
    ),
  );
  assert.equal(mock.calls.length, 2);
  assert.deepEqual(
    new Set(mock.calls.map((c) => (c.body as URLSearchParams).get('phone'))),
    new Set([smsEnv.CLARK, smsEnv.ANGIE]),
  );
});
test('ambiguous provider failure never repeats a possibly accepted SMS', async () => {
  const store = new MemoryStore();
  let calls = 0;
  const send = (async () => {
    calls++;
    throw new Error('network timeout');
  }) as typeof fetch;
  const options = {
    store,
    env: smsEnv,
    now: new Date('2026-09-08T21:00:00Z'),
    send,
  };
  await sendReminders(options);
  await sendReminders(options);
  assert.equal(calls, 2);
  assert.equal(
    (await store.get<{ state: string }>('reminder/2026-09-08/CLARK'))?.state,
    'unknown',
  );
});
test('walk logged before second SMS prevents that send', async () => {
  const store = new MemoryStore();
  let calls = 0;
  const send = (async () => {
    calls++;
    await store.set('walk/2026-09-08', {});
    return Response.json({ success: true, textId: '1' });
  }) as typeof fetch;
  await sendReminders({
    store,
    env: smsEnv,
    now: new Date('2026-09-08T21:00:00Z'),
    send,
  });
  assert.equal(calls, 1);
});
test('80 unique short roasts rotate daily and include sender and opt out', () => {
  assert.equal(ROASTS.length, 80);
  assert.equal(new Set(ROASTS).size, 80);
  for (let i = 0; i < 80; i++) {
    const sms = roastForDay(offsetDay('2026-09-08', i));
    assert.ok(sms.length <= 160, `SMS too long (${sms.length}): ${sms}`);
    assert.match(sms, /^Walky: /);
    assert.match(sms, /Reply STOP to opt out\.$/);
    assert.ok(/^[\x20-\x7e]*$/.test(sms));
  }
  assert.notEqual(roastForDay('2026-09-08'), roastForDay('2026-09-09'));
});
