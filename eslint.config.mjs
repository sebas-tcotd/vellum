// @ts-check
import eslintConfigPrettier from 'eslint-config-prettier';
import prettier from 'eslint-plugin-prettier';
import tseslint from 'typescript-eslint';

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/src-tauri/**',
    ],
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
              group: [
                '@vellum/core/src/*',
                '@vellum/core/dist/*',
                '**/core/src/**',
                '**/core/dist/**',
              ],
              message: 'Import from @vellum/core, not internal paths',
            },
            {
              group: [
                '@vellum/renderer-canvas/*',
                '**/renderer-canvas/src/**',
                '**/renderer-canvas/dist/**',
              ],
              message:
                'Import from @vellum/renderer-canvas, not internal paths',
            },
            {
              group: [
                '@vellum/theme-engine/*',
                '**/theme-engine/src/**',
                '**/theme-engine/dist/**',
              ],
              message: 'Import from @vellum/theme-engine, not internal paths',
            },
            {
              group: [
                '@vellum/ui/src/*',
                '@vellum/ui/dist/*',
                '**/ui/src/**',
                '**/ui/dist/**',
              ],
              message: 'Import from @vellum/ui, not internal paths',
            },
            {
              // `@/*` solo existe como alias de Vite en apps/desktop (apunta a
              // packages/ui/src). @vellum/ui se consume compilado (dist), así
              // que un `@/...` dentro de packages/ui/src sobrevive intacto a tsc
              // y termina resuelto por Vite contra SRC en vez de dist: cualquier
              // módulo con estado (el store de Zustand, un singleton) queda
              // duplicado en dos instancias que no se enteran entre sí.
              group: ['@/*'],
              message:
                'El alias @/ solo lo resuelve Vite en apps/desktop apuntando a packages/ui/src; @vellum/ui se consume compilado (dist), así que sobrevive intacto y termina resolviendo contra src en vez de dist — usa una ruta relativa.',
            },
            {
              group: [
                '@vellum/parser-cslmap/*',
                '**/parser-cslmap/src/**',
                '**/parser-cslmap/dist/**',
              ],
              message: 'Import from @vellum/parser-cslmap, not internal paths',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/*/src/**/*.{ts,tsx}', 'apps/desktop/src/**/*.{ts,tsx}'],
    plugins: {
      prettier,
    },
    rules: {
      ...eslintConfigPrettier.rules,
      'prettier/prettier': 'error',
    },
  },
  {
    // Node-side tooling scripts (the baseline export golden harness). Plain
    // ESM, no TS parser — they sit outside the tsc projects, so lint and
    // prettier are their only gates.
    files: ['packages/*/test/**/*.mjs', 'apps/desktop/scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: {
      prettier,
    },
    rules: {
      ...eslintConfigPrettier.rules,
      'prettier/prettier': 'error',
      'no-unused-vars': 'error',
    },
  },
];
