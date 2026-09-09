export function dayInZone(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function offsetDay(date: string, offset: number): string {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + offset);
  return day.toISOString().slice(0, 10);
}
export function validDay(date: unknown): date is string {
  return (
    typeof date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date
  );
}
export function summarize(dates: string[], today: string, timezone: string) {
  const unique = [...new Set(dates)].filter((d) => d <= today).sort();
  const set = new Set(unique);
  let streak = 0;
  let cursor = set.has(today) ? today : offsetDay(today, -1);
  while (set.has(cursor)) {
    streak++;
    cursor = offsetDay(cursor, -1);
  }
  let best = 0,
    run = 0,
    prev = '';
  for (const date of unique) {
    run = prev && offsetDay(prev, 1) === date ? run + 1 : 1;
    best = Math.max(best, run);
    prev = date;
  }
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const monday = offsetDay(today, -weekday);
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = offsetDay(monday, i);
    return {
      date,
      walked: set.has(date),
      today: date === today,
      future: date > today,
    };
  });
  return {
    today,
    timezone,
    walkedToday: set.has(today),
    streak,
    bestStreak: best,
    total: unique.length,
    thisMonth: unique.filter((d) => d.startsWith(today.slice(0, 7))).length,
    weekCount: week.filter((d) => d.walked).length,
    dates: unique,
    week,
  };
}
export type WalkStatus = ReturnType<typeof summarize>;
