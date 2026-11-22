import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'));
const BUILD_ID = `${pkg.version}-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;

/**
 * Generates the service worker at build time with an exact precache list of
 * every emitted asset, so the installed app works fully offline and each
 * deploy gets a new cache version (old caches are removed on activate).
 */
function serviceWorker(): Plugin {
  return {
    name: 'daymark-sw',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const publicFiles = ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon.svg'];
      const precache = ['./', ...new Set([...files, ...publicFiles])].map((f) => (f === './' ? f : `./${f}`));
      const template = readFileSync(resolve(__dirname, 'src/sw/sw-template.js'), 'utf8');
      const source = template
        .replace('__BUILD_ID__', JSON.stringify(BUILD_ID))
        .replace('__PRECACHE__', JSON.stringify(precache, null, 2));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  // Relative base so the same build works at a domain root or a GitHub Pages sub-path.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [react(), serviceWorker()],
  build: { target: 'es2020', sourcemap: false },
  esbuild: { charset: 'ascii' },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as never);
