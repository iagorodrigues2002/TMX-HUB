import tseslint from 'typescript-eslint';
import quality from './eslint.quality.config.mjs';

export default [
  ...quality,
  {
    files: ['packages/*/src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',
    },
  },
];
