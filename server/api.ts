import type { Store } from './store';
import {
  ApiError,
  authenticate,
  body,
  getToken,
  handle,
  json,
  keys,
  logWalk,
  sameOrigin,
  status,
  type Config,
} from './core';
import { validDay } from '../lib/walky/dates';
import {
  archiveChallenge,
  challengeFeed,
  claimReward,
  completeChallengeItem,
  createChallenge,
} from './challenges';
export function createApi(store: Store, cfg: Config) {
  return (request: Request) =>
    handle(async () => {
      const route = new URL(request.url).pathname.replace(
        /^\/\.netlify\/functions\/api/,
        '/api',
      );
      const method = request.method;
      if (route === '/api/rewards/next' && method === 'GET') {
        authenticate(request, cfg, 'reward');
        return json({
          nextReward: (await challengeFeed(store, cfg)).nextReward,
        });
      }
      if (
        route === '/api/challenges' &&
        (method === 'GET' || method === 'POST')
      ) {
        authenticate(request, cfg);
        if (method === 'GET') return json(await challengeFeed(store, cfg));
        sameOrigin(request);
        return json(
          await createChallenge(store, cfg, await body(request)),
          201,
        );
      }
      const challengeRoute = route.match(
        /^\/api\/challenges\/([^/]+)(?:\/(claim|items)(?:\/([^/]+))?)?$/,
      );
      if (challengeRoute) {
        authenticate(request, cfg);
        sameOrigin(request);
        const [, id, action, itemId] = challengeRoute;
        if (!action && method === 'DELETE')
          return json(await archiveChallenge(store, cfg, id));
        if (action === 'claim' && !itemId && method === 'POST')
          return json(await claimReward(store, cfg, id));
        if (
          action === 'items' &&
          itemId &&
          (method === 'POST' || method === 'DELETE')
        )
          return json(
            await completeChallengeItem(
              store,
              cfg,
              id,
              itemId,
              method === 'POST',
            ),
          );
      }
      if (route === '/api/household' && method === 'POST') {
        sameOrigin(request);
        const input = await body(request);
        if (typeof input.token !== 'string')
          throw new ApiError(400, 'Paste your connection code.');
        authenticate(
          new Request(request.url, {
            headers: { Authorization: `Bearer ${input.token}` },
          }),
          cfg,
        );
        return json({ connected: true }, 200, {
          'Set-Cookie': `walky=${encodeURIComponent(input.token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`,
        });
      }
      if (route === '/api/status' && method === 'GET') {
        authenticate(request, cfg, 'read');
        return json(await status(store, cfg));
      }
      if (route === '/api/settings' && method === 'GET') {
        authenticate(request, cfg);
        return json({
          timezone: cfg.timezone,
          connectionCode: getToken(request),
          ...keys(cfg.token),
          reminders: {
            hour: 16,
            timezone: 'America/Chicago',
            configured: !!(
              process.env.CLARK &&
              process.env.ANGIE &&
              (process.env.TEXBELT || process.env.TEXTBELT)
            ),
          },
        });
      }
      if (route === '/api/log' && (method === 'GET' || method === 'POST')) {
        authenticate(request, cfg, 'log');
        return json(await logWalk(store, cfg));
      }
      if (
        route === '/api/walks' &&
        (method === 'POST' || method === 'DELETE')
      ) {
        sameOrigin(request);
        authenticate(request, cfg);
        const input = await body(request);
        if (method === 'POST')
          return json(await logWalk(store, cfg, input.date));
        if (!validDay(input.date))
          throw new ApiError(400, 'Choose a real date.');
        await store.remove(`walk/${input.date}`);
        return json(await status(store, cfg));
      }
      return json({ error: 'Endpoint or method not found.' }, 404);
    });
}
