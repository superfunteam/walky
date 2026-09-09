import { randomUUID } from 'node:crypto';
import { dayInZone } from '../lib/walky/dates';
import {
  challengeProgress,
  nextReward,
  type ChallengeDefinition,
  type ChallengeFeed,
} from '../lib/walky/challenges';
import { ApiError, logWalk, status, type Config } from './core';
import type { Store } from './store';

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function challengeFeed(
  store: Store,
  cfg: Config,
  now = new Date(),
): Promise<ChallengeFeed> {
  const [records, archived, claims, completions, walks] = await Promise.all([
    store.list('challenge/'),
    store.list('challenge-archive/'),
    store.list('challenge-claim/'),
    store.list('challenge-item/'),
    status(store, cfg, now),
  ]);
  const excluded = new Set(archived.map((key) => key.split('/')[1]));
  const definitions = await Promise.all(
    records
      .filter((key) => !excluded.has(key.split('/')[1]))
      .map((key) => store.get<ChallengeDefinition>(key)),
  );
  const claimed = new Map(
    await Promise.all(
      claims.map(
        async (key) =>
          [
            key.split('/')[1],
            (await store.get<{ claimedAt: string }>(key))?.claimedAt ?? null,
          ] as const,
      ),
    ),
  );
  const items = new Map(
    await Promise.all(
      completions.map(
        async (key) =>
          [key, (await store.get<{ date: string }>(key))?.date] as const,
      ),
    ),
  );
  const challenges = definitions
    .filter((c): c is ChallengeDefinition => !!c)
    .map((definition) => {
      const completed = Object.fromEntries(
        definition.items.flatMap((item) => {
          const date = items.get(`challenge-item/${definition.id}/${item.id}`);
          return date ? [[item.id, date]] : [];
        }),
      );
      return challengeProgress(
        definition,
        walks.dates,
        walks.today,
        completed,
        claimed.get(definition.id) ?? null,
      );
    })
    .sort(
      (a, b) =>
        Number(!!a.claimedAt) - Number(!!b.claimedAt) ||
        b.createdAt.localeCompare(a.createdAt),
    );
  return { challenges, nextReward: nextReward(challenges) };
}

export async function createChallenge(
  store: Store,
  cfg: Config,
  input: Record<string, unknown>,
  now = new Date(),
) {
  const id = input.id ?? randomUUID();
  if (typeof id !== 'string' || !ID.test(id))
    throw new ApiError(400, 'Choose a valid challenge ID.');
  if (input.kind !== 'streak' && input.kind !== 'checklist')
    throw new ApiError(400, 'Choose a streak or a walk checklist.');
  if (
    typeof input.reward !== 'string' ||
    !input.reward.trim() ||
    input.reward.trim().length > 140
  )
    throw new ApiError(400, 'Give your reward a name, up to 140 characters.');
  const items: ChallengeDefinition['items'] = [];
  if (input.kind === 'checklist') {
    if (
      !Array.isArray(input.items) ||
      input.items.length < 1 ||
      input.items.length > 30
    )
      throw new ApiError(400, 'Add between 1 and 30 walks to your checklist.');
    for (const [index, label] of input.items.entries()) {
      if (
        typeof label !== 'string' ||
        !label.trim() ||
        label.trim().length > 80
      )
        throw new ApiError(400, 'Give each walk a name, up to 80 characters.');
      items.push({ id: String(index), label: label.trim() });
    }
  } else if (
    typeof input.target !== 'number' ||
    !Number.isInteger(input.target) ||
    input.target < 1 ||
    input.target > 365
  ) {
    throw new ApiError(400, 'Choose a streak between 1 and 365 days.');
  }
  const definition: ChallengeDefinition = {
    id,
    kind: input.kind,
    reward: input.reward.trim(),
    target:
      input.kind === 'checklist' ? items.length : (input.target as number),
    items,
    startsOn: dayInZone(cfg.timezone, now),
    createdAt: now.toISOString(),
  };
  const existing = await store.get<ChallengeDefinition>(`challenge/${id}`);
  if (existing) {
    if (
      existing.reward !== definition.reward ||
      existing.kind !== definition.kind ||
      existing.target !== definition.target ||
      JSON.stringify(existing.items) !== JSON.stringify(definition.items)
    )
      throw new ApiError(409, 'That challenge already exists.');
    return challengeFeed(store, cfg, now);
  }
  const active = (await challengeFeed(store, cfg, now)).challenges.filter(
    (c) => !c.claimedAt,
  );
  if (active.length >= 20)
    throw new ApiError(
      400,
      'Finish or remove a challenge before adding another.',
    );
  await store.set(`challenge/${id}`, definition, true);
  return challengeFeed(store, cfg, now);
}

async function requireChallenge(store: Store, id: string) {
  if (!ID.test(id)) throw new ApiError(404, 'Challenge not found.');
  const challenge = await store.get<ChallengeDefinition>(`challenge/${id}`);
  if (!challenge || (await store.get(`challenge-archive/${id}`)))
    throw new ApiError(404, 'Challenge not found.');
  return challenge;
}

export async function completeChallengeItem(
  store: Store,
  cfg: Config,
  id: string,
  itemId: string,
  complete: boolean,
  now = new Date(),
) {
  const challenge = await requireChallenge(store, id);
  if (
    challenge.kind !== 'checklist' ||
    !challenge.items.some((item) => item.id === itemId)
  )
    throw new ApiError(404, 'That walk is not on this checklist.');
  if (await store.get(`challenge-claim/${id}`))
    throw new ApiError(409, 'This reward has already been claimed.');
  const key = `challenge-item/${id}/${itemId}`;
  if (complete) {
    if (!(await store.get(key))) {
      // Record the shared day first; retries and two phones still count it once.
      // A retry on a later day must not create another daily check-in.
      await logWalk(store, cfg, undefined, now);
      await store.set(
        key,
        { date: dayInZone(cfg.timezone, now), completedAt: now.toISOString() },
        true,
      );
    }
  } else await store.remove(key);
  return {
    ...(await challengeFeed(store, cfg, now)),
    walkStatus: await status(store, cfg, now),
  };
}

export async function claimReward(
  store: Store,
  cfg: Config,
  id: string,
  now = new Date(),
) {
  await requireChallenge(store, id);
  const challenge = (await challengeFeed(store, cfg, now)).challenges.find(
    (c) => c.id === id,
  )!;
  if (!challenge.unlocked)
    throw new ApiError(409, 'A few more walks before this reward unlocks.');
  await store.set(
    `challenge-claim/${id}`,
    { claimedAt: now.toISOString(), reward: challenge.reward },
    true,
  );
  return challengeFeed(store, cfg, now);
}

export async function archiveChallenge(
  store: Store,
  cfg: Config,
  id: string,
  now = new Date(),
) {
  await requireChallenge(store, id);
  await store.set(
    `challenge-archive/${id}`,
    { archivedAt: now.toISOString() },
    true,
  );
  return challengeFeed(store, cfg, now);
}
