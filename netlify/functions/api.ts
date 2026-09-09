import type { Config, Context } from '@netlify/functions';
import { createApi } from '../../server/api';
import { config as appConfig, handle } from '../../server/core';
import { blobStore } from '../../server/store';
export default (request: Request, context: Context) =>
  handle(() =>
    createApi(blobStore(context.deploy.context), appConfig())(request),
  );
export const config: Config = { path: '/api/*' };
