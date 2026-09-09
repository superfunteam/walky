import { offsetDay, summarize } from './dates';

export type ChallengeDefinition = {
  id: string;
  kind: 'streak' | 'checklist';
  reward: string;
  target: number;
  items: { id: string; label: string }[];
  startsOn: string;
  createdAt: string;
};
export type Challenge = ChallengeDefinition & {
  progress: number;
  remaining: number;
  currentStreak: number;
  bestStreak: number;
  unlocked: boolean;
  unlockedOn: string | null;
  claimedAt: string | null;
  completedItems: Record<string, string>;
  recentDays: { date: string; walked: boolean }[];
};
export type NextReward = {
  id: string;
  reward: string;
  kind: Challenge['kind'];
  progress: number;
  target: number;
  remaining: number;
  unlocked: boolean;
  unlockedOn: string | null;
  remainingWalks: string[];
};
export type ChallengeFeed = {
  challenges: Challenge[];
  nextReward: NextReward | null;
};

export function challengeProgress(
  definition: ChallengeDefinition,
  dates: string[],
  today: string,
  completedItems: Record<string, string> = {},
  claimedAt: string | null = null,
): Challenge {
  const eligible = [...new Set(dates)]
    .filter((day) => day >= definition.startsOn && day <= today)
    .sort();
  const summary = summarize(eligible, today, 'America/Chicago');
  let unlockedOn: string | null = null;
  let run = 0,
    previous = '';
  if (definition.kind === 'streak') {
    for (const day of eligible) {
      run = previous && offsetDay(previous, 1) === day ? run + 1 : 1;
      previous = day;
      if (run >= definition.target) {
        unlockedOn = day;
        break;
      }
    }
  } else {
    const completions = definition.items
      .map((item) => completedItems[item.id])
      .filter(Boolean);
    if (completions.length === definition.target)
      unlockedOn = completions.sort().at(-1)!.slice(0, 10);
  }
  const unlocked = unlockedOn !== null || claimedAt !== null;
  const progress = unlocked
    ? definition.target
    : definition.kind === 'streak'
      ? Math.min(definition.target, summary.streak)
      : definition.items.filter((item) => completedItems[item.id]).length;
  return {
    ...definition,
    progress,
    remaining: definition.target - progress,
    currentStreak: summary.streak,
    bestStreak: summary.bestStreak,
    unlocked,
    unlockedOn,
    claimedAt,
    completedItems,
    recentDays: Array.from({ length: 7 }, (_, i) => {
      const date = offsetDay(today, i - 6);
      return { date, walked: eligible.includes(date) };
    }),
  };
}

export function nextReward(challenges: Challenge[]): NextReward | null {
  const next = challenges
    .filter((c) => !c.claimedAt)
    .sort(
      (a, b) =>
        Number(b.unlocked) - Number(a.unlocked) ||
        b.progress / b.target - a.progress / a.target ||
        a.createdAt.localeCompare(b.createdAt),
    )[0];
  if (!next) return null;
  return {
    id: next.id,
    reward: next.reward,
    kind: next.kind,
    progress: next.progress,
    target: next.target,
    remaining: next.remaining,
    unlocked: next.unlocked,
    unlockedOn: next.unlockedOn,
    remainingWalks: next.items
      .filter((item) => !next.completedItems[item.id])
      .map((item) => item.label),
  };
}
