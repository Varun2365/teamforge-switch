import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// In dev, hand the dashboard the API key from the repo-root .env so auth "just works".
// Production builds use the key saved in the browser via Settings.
function devApiKey(): string {
  try {
    const envPath = join(__dirname, '../../.env');
    if (!existsSync(envPath)) return '';
    const m = readFileSync(envPath, 'utf8').match(/^TEAMFORGE_API_KEY=(.+)$/m);
    return m ? m[1]!.trim() : '';
  } catch {
    return '';
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __DEV_API_KEY__: JSON.stringify(process.env.NODE_ENV === 'test' ? '' : devApiKey()),
  },
  server: {
    port: 5183,
    host: '127.0.0.1',
    proxy: {
      '/api': 'http://127.0.0.1:4100',
      '/health': 'http://127.0.0.1:4100',
      '/openapi.json': 'http://127.0.0.1:4100',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
