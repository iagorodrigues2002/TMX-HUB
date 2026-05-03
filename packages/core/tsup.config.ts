import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  minify: false,
  external: [
    'playwright',
    'playwright-extra',
    'puppeteer-extra-plugin-stealth',
    'jsdom',
    'archiver',
    'undici',
  ],
});
