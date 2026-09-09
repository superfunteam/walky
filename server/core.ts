import { createHash, timingSafeEqual } from 'node:crypto';
import { dayInZone, summarize, validDay } from '../lib/walky/dates';
import type { Store } from './store';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type Config = { token: string; timezone: string };
export function config(): Config {
  const token = process.env.WALKY_TOKEN || '';
  if (token.length < 32)
    throw new ApiError(
      503,
      'Set WALKY_TOKEN in Netlify to a private connection code of at least 32 characters.',
    );
  const timezone = process.env.WALKY_TIMEZONE || 'America/Chicago';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    throw new ApiError(503, 'WALKY_TIMEZONE must be a valid IANA time zone.');
  }
  return { token, timezone };
}
export const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const keys = (token: string) => ({
  read: 'r_' + hash(token + ':read'),
  log: 'l_' + hash(token + ':log'),
});
const equal = (a: string, b: string) =>
  timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
export const json = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
export async function handle(fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) return json({ error: e.message }, e.status);
    console.error(
      'Walky request failed',
      e instanceof Error
        ? e.name === 'MissingBlobsEnvironmentError'
          ? e.message
          : e.name
        : 'unknown',
    );
    return json({ error: 'Could not save right now. Please try again.' }, 500);
  }
}
export function getToken(request: Request) {
  const auth = request.headers.get('Authorization');
  if (auth) return auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const query = new URL(request.url).searchParams.get('key');
  if (query) return query;
  try {
    return decodeURIComponent(
      request.headers
        .get('Cookie')
        ?.split(';')
        .map((x) => x.trim())
        .find((x) => x.startsWith('walky='))
        ?.slice(6) || '',
    );
  } catch {
    return '';
  }
}
export function authenticate(
  request: Request,
  cfg: Config,
  scope: 'owner' | 'read' | 'log' = 'owner',
) {
  const token = getToken(request),
    derived = keys(cfg.token);
  if (!token) throw new ApiError(401, 'Connect your shared calendar first.');
  if (equal(token, cfg.token)) return 'owner';
  if (scope === 'read' && equal(token, derived.read)) return 'read';
  if (scope === 'log' && equal(token, derived.log)) return 'log';
  throw new ApiError(403, 'That connection code cannot perform this action.');
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin)
    throw new ApiError(403, 'This request must come from your Walky app.');
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site')
    throw new ApiError(403, 'Cross-site request rejected.');
}
export async function body(request: Request) {
  if (Number(request.headers.get('Content-Length')) > 4096)
    throw new ApiError(413, 'Request too large.');
  const raw = await request.text();
  if (raw.length > 4096) throw new ApiError(413, 'Request too large.');
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error();
    return data;
  } catch {
    throw new ApiError(400, 'Expected a JSON object.');
  }
}
export async function status(store: Store, cfg: Config, now = new Date()) {
  const dates = (await store.list('walk/'))
    .map((key) => key.slice(5))
    .filter(validDay);
  return summarize(dates, dayInZone(cfg.timezone, now), cfg.timezone);
}
export async function logWalk(
  store: Store,
  cfg: Config,
  requested?: unknown,
  now = new Date(),
) {
  const today = dayInZone(cfg.timezone, now);
  const date = requested === undefined ? today : requested;
  if (!validDay(date) || date > today || date < '2000-01-01')
    throw new ApiError(400, 'Choose a real date between 2000 and today.');
  await store.set(`walk/${date}`, { date, createdAt: now.toISOString() }, true);
  return status(store, cfg, now);
}
