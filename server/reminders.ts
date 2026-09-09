import { dayInZone } from '../lib/walky/dates';
import type { Store } from './store';
import { roastForDay } from './roasts';
export type ReminderEnv = {
  CLARK?: string;
  ANGIE?: string;
  TEXBELT?: string;
  TEXTBELT?: string;
  SMS_ENABLED?: string;
};
type Result = { recipient: string; state: string; textId?: string };
export async function sendReminders({
  store,
  env,
  now = new Date(),
  send = fetch,
}: {
  store: Store;
  env: ReminderEnv;
  now?: Date;
  send?: typeof fetch;
}) {
  const timezone = 'America/Chicago',
    date = dayInZone(timezone, now);
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now),
  );
  if (hour !== 16) return { date, skipped: 'not-4pm-central', results: [] };
  if (env.SMS_ENABLED === 'false')
    return { date, skipped: 'disabled', results: [] };
  const textbeltKey = env.TEXBELT || env.TEXTBELT;
  if (!env.CLARK || !env.ANGIE || !textbeltKey)
    throw new Error(
      'Configure CLARK, ANGIE and TEXBELT (or TEXTBELT) in Netlify function environment variables.',
    );
  for (const phone of [env.CLARK, env.ANGIE])
    if (!/^\+?[1-9]\d{9,14}$/.test(phone))
      throw new Error(
        'CLARK and ANGIE must be phone numbers with country/area codes and no punctuation.',
      );
  if (await store.get(`walk/${date}`))
    return { date, skipped: 'already-walked', results: [] };
  const results: Result[] = [];
  // Sequential calls stay within Textbelt's guidance. Each recipient gets its own
  // atomic claim, so overlapping cron invocations cannot duplicate a send.
  for (const recipient of ['CLARK', 'ANGIE'] as const) {
    const key = `reminder/${date}/${recipient}`;
    if (
      !(await store.set(
        key,
        { state: 'sending', attemptedAt: now.toISOString() },
        true,
      ))
    ) {
      results.push({ recipient, state: 'already-attempted' });
      continue;
    }
    if (await store.get(`walk/${date}`)) {
      await store.set(key, { state: 'skipped-walked' });
      results.push({ recipient, state: 'skipped-walked' });
      continue;
    }
    let result: Result;
    try {
      const response = await send('https://textbelt.com/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          phone: env[recipient]!,
          message: roastForDay(date),
          key: textbeltKey,
          sender: 'Walky',
        }),
        signal: AbortSignal.timeout(12000),
      });
      const data = (await response.json()) as {
        success?: boolean;
        textId?: string;
      };
      result = {
        recipient,
        state: response.ok && data.success === true ? 'sent' : 'rejected',
        ...(data.textId ? { textId: data.textId } : {}),
      };
    } catch {
      result = { recipient, state: 'unknown' };
    }
    // Textbelt has no idempotency key. Retain claims on failures/timeouts: it may
    // have accepted a text before the connection failed. Never blindly re-send.
    await store.set(key, { ...result, attemptedAt: now.toISOString() });
    results.push(result);
  }
  return { date, results };
}
