import type { Context } from '@netlify/functions';
import { blobStore } from '../../server/store';
import { sendReminders } from '../../server/reminders';
export default async (_request: Request, context: Context) => {
  // Scheduled functions run only on published deploys. Also fail closed in dev
  // and deploy previews, even when manually invoked from Netlify tooling.
  if (context.deploy.context !== 'production')
    return Response.json({ skipped: 'not-production' });
  const result = await sendReminders({
    store: blobStore(context.deploy.context),
    env: process.env,
  });
  console.log('Walky reminder', JSON.stringify(result));
  return Response.json(result);
};
