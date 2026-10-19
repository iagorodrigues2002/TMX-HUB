import tseslint from 'typescript-eslint';
import quality from './eslint-rules/index.cjs';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.next*/**'] },
  {
    files: ['packages/*/src/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    plugins: { quality, '@typescript-eslint': tseslint.plugin },
    // Measure legacy debt without hiding it or forcing unrelated refactors.
    rules: { 'quality/max-lines': ['warn', { max: 350 }] },
  },
  {
    files: ['packages/{api,core}/src/**/*.ts'],
    rules: {
      'quality/no-direct-console': [
        'warn',
        { logger: 'the existing logger or injected Fastify logger' },
      ],
    },
  },
  {
    files: ['packages/web/src/**/*.{ts,tsx}'],
    rules: {
      'quality/no-direct-data-access': [
        'error',
        {
          modules: ['postgres'],
          layers: ['/packages/web/src/'],
        },
      ],
    },
  },
];
