// ESLint 9 flat config: recommended JS + TS rules and the React hooks rules.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist/**', 'dev-dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    name: 'makro/shared',
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  {
    name: 'makro/browser',
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    name: 'makro/node',
    files: ['tests/**/*.ts', 'src/**/*.test.ts', 'vite.config.ts', 'playwright.config.ts', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
]);
