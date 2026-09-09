import { getStore } from '@netlify/blobs';
export interface Store {
  get<T>(key: string): Promise<T | null>;
  set(key: string, data: unknown, onlyIfNew?: boolean): Promise<boolean>;
  remove(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}
export function blobStore(deployContext?: string): Store {
  // Deploy previews must never share walk/reminder state with production.
  const context = deployContext || process.env.CONTEXT;
  const name =
    !context || context === 'production'
      ? 'walky'
      : `walky-${context}-${(process.env.BRANCH || process.env.NETLIFY_BRANCH)?.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 32) || 'local'}`;
  const store = getStore({ name, consistency: 'strong' });
  return {
    get: <T>(key: string) =>
      store.get(key, { type: 'json' }) as Promise<T | null>,
    set: async (key, data, onlyIfNew = false) =>
      (await store.setJSON(key, data, { onlyIfNew })).modified,
    remove: (key) => store.delete(key),
    list: async (prefix) => {
      const keys: string[] = [];
      for await (const page of store.list({ prefix, paginate: true }))
        for (const item of page.blobs) keys.push(item.key);
      return keys;
    },
  };
}
