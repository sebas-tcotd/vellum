// @ts-check
import tseslint from 'typescript-eslint';

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.turbo/**', '**/src-tauri/**'],
  },
  {
    files: ['packages/*/src/**/*.{ts,tsx}', 'apps/desktop/src/**/*.{ts,tsx}'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['*/packages/core/src/*'],
              message: 'Import from @vellum/core, not internal paths',
            },
            {
              group: ['*/packages/renderer-canvas/src/*'],
              message: 'Import from @vellum/renderer-canvas, not internal paths',
            },
            {
              group: ['*/packages/theme-engine/src/*'],
              message: 'Import from @vellum/theme-engine, not internal paths',
            },
            {
              group: ['*/packages/ui/src/*'],
              message: 'Import from @vellum/ui, not internal paths',
            },
          ],
        },
      ],
    },
  },
];
