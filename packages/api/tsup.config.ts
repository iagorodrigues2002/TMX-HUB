import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  // Bundle workspace deps that don't have a compiled dist (otherwise Node
  // can't resolve their .ts source at runtime). @page-cloner/core is left
  // external because it ships its own dist (built separately) and is
  // imported dynamically by the workers.
  noExternal: ['@page-cloner/shared'],
});
