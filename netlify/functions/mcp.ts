import type { Config, Context } from '@netlify/functions';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {
  authenticate,
  body,
  config as appConfig,
  handle,
  json,
  logWalk,
  sameOrigin,
  status,
} from '../../server/core';
import { blobStore } from '../../server/store';
import { challengeFeed } from '../../server/challenges';
export default (request: Request, context: Context) =>
  handle(async () => {
    if (request.method !== 'POST')
      return json({ error: 'Use MCP Streamable HTTP POST.' }, 405, {
        Allow: 'POST',
      });
    sameOrigin(request);
    const cfg = appConfig();
    authenticate(request, cfg);
    const parsedBody = await body(request);
    const store = blobStore(context.deploy.context);
    const server = new McpServer({ name: 'walky', version: '0.1.0' });
    server.registerTool(
      'next_reward',
      {
        description:
          'Read the next unclaimed team reward and challenge progress, or null if none exists. Includes remaining checklist walks and whether the reward is unlocked.',
        inputSchema: {},
        annotations: { readOnlyHint: true },
      },
      async () => ({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              nextReward: (await challengeFeed(store, cfg)).nextReward,
            }),
          },
        ],
      }),
    );
    server.registerTool(
      'walk_status',
      {
        description:
          'Get the shared household walking status, streak, and dates.',
        inputSchema: {},
        annotations: { readOnlyHint: true },
      },
      async () => ({
        content: [
          { type: 'text', text: JSON.stringify(await status(store, cfg)) },
        ],
      }),
    );
    server.registerTool(
      'log_walk',
      {
        description:
          'Record that we walked today in our household time zone. Repeated calls count once.',
        inputSchema: {},
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
        },
      },
      async () => ({
        content: [
          { type: 'text', text: JSON.stringify(await logWalk(store, cfg)) },
        ],
      }),
    );
    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse: true,
    });
    await server.connect(transport);
    try {
      return await transport.handleRequest(request, { parsedBody });
    } finally {
      await server.close();
    }
  });
export const config: Config = { path: '/mcp' };
