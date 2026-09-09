import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import netlify from '@netlify/vite-plugin';
import { fileURLToPath } from 'node:url';
export default defineConfig(({ mode }) => {
  // Server-only development variables; Vite exposes only VITE_* to the client.
  const local = loadEnv(mode, process.cwd(), '');
  for (const key of [
    'WALKY_TOKEN',
    'WALKY_TIMEZONE',
    'CLARK',
    'ANGIE',
    'TEXBELT',
    'SMS_ENABLED',
  ])
    if (local[key] && !process.env[key]) process.env[key] = local[key];
  return {
    plugins: [
      react(),
      netlify({
        edgeFunctions: { enabled: false },
        images: { enabled: false },
      }),
    ],
    resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
    css: { postcss: { plugins: [tailwindcss()] } },
    server: {
      host: '127.0.0.1',
      port: 3000,
      strictPort: true,
      watch: { ignored: ['**/android/**', '**/.netlify/**'] },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: (id: string) =>
            id.includes('@dimforge/rapier')
              ? 'physics'
              : id.includes('/three/')
                ? 'three'
                : undefined,
        },
      },
    },
  };
});
