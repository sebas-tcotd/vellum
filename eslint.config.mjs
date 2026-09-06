// @ts-check
import eslintConfigPrettier from 'eslint-config-prettier';
import prettier from 'eslint-plugin-prettier';
import tseslint from 'typescript-eslint';

/**
 * Deep-import guards: every package is consumed through its barrel, never
 * through an internal path.
 *
 * @remarks
 * Hoisted to a constant because ESLint flat config replaces a rule's options
 * wholesale when a later block re-declares it. The per-package
 * dependency-direction scopes below re-declare `no-restricted-imports`, so they
 * have to spread these back in or scoping a package would silently drop its
 * barrel guard.
 *
 * Cada entrada lleva la variante `/**` además de `/*`: un solo `*` no cruza
 * `/`, así que `@vellum/renderer-webgl/*` deja pasar
 * `@vellum/renderer-webgl/dist/managers/x` — justo la ruta profunda que la
 * regla existe para bloquear.
 */
const deepImportPatterns = [
  {
    group: [
      '@vellum/core/src/*',
      '@vellum/core/src/**',
      '@vellum/core/dist/*',
      '@vellum/core/dist/**',
      '**/core/src/**',
      '**/core/dist/**',
    ],
    message: 'Import from @vellum/core, not internal paths',
  },
  {
    group: [
      '@vellum/theme-engine/*',
      '@vellum/theme-engine/**',
      '**/theme-engine/src/**',
      '**/theme-engine/dist/**',
    ],
    message: 'Import from @vellum/theme-engine, not internal paths',
  },
  {
    group: [
      '@vellum/ui/src/*',
      '@vellum/ui/src/**',
      '@vellum/ui/dist/*',
      '@vellum/ui/dist/**',
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
    group: ['@/*', '@/**'],
    message:
      'El alias @/ solo lo resuelve Vite en apps/desktop apuntando a packages/ui/src; @vellum/ui se consume compilado (dist), así que sobrevive intacto y termina resolviendo contra src en vez de dist — usa una ruta relativa.',
  },
  {
    group: [
      '@vellum/parser-cslmap/*',
      '@vellum/parser-cslmap/**',
      '**/parser-cslmap/src/**',
      '**/parser-cslmap/dist/**',
    ],
    message: 'Import from @vellum/parser-cslmap, not internal paths',
  },
  {
    group: [
      '@vellum/renderer-webgl/*',
      '@vellum/renderer-webgl/**',
      '**/renderer-webgl/src/**',
      '**/renderer-webgl/dist/**',
    ],
    message: 'Import from @vellum/renderer-webgl, not internal paths',
  },
];

/**
 * Dependency-direction guards, one scope per package (ADR-0001).
 *
 * @remarks
 * The graph is `desktop → {ui, renderer-webgl, theme-engine, parser-cslmap,
 * core}`, `ui → {theme-engine, core}`, `renderer-webgl → core`,
 * `theme-engine → core`, `parser-cslmap → core`, `core → nothing`.
 * Before Story 1.3 nothing enforced it, which is how `@vellum/ui` came to
 * instantiate `MapLibreRenderer` and call `@tauri-apps/*` directly.
 * `apps/desktop` is deliberately unscoped: the composition root is the one
 * place allowed to import every adapter.
 */
const dependencyDirectionScopes = [
  {
    // `@vellum/core` is the entity layer: no package, no framework, no shell.
    files: ['packages/core/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...deepImportPatterns,
            {
              group: ['@vellum/*'],
              message:
                '@vellum/core is the innermost layer — it must not import any other @vellum package (ADR-0001).',
            },
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
              message:
                '@vellum/core must stay framework-free — React belongs to @vellum/ui (ADR-0001).',
            },
            {
              group: ['maplibre-gl', 'maplibre-gl/*'],
              message:
                '@vellum/core must not name a rendering technology — MapLibre belongs to @vellum/renderer-webgl (ADR-0001).',
            },
            {
              group: ['@tauri-apps/*'],
              message:
                '@vellum/core must not depend on the desktop shell — Tauri is assembled only in apps/desktop (ADR-0001).',
            },
          ],
        },
      ],
    },
  },
  {
    // `@vellum/ui` presents; it never names a rendering technology or a shell.
    files: ['packages/ui/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...deepImportPatterns,
            {
              group: ['@tauri-apps/*'],
              message:
                '@vellum/ui must not import Tauri — use the injected PlatformServices contract (context/PlatformServicesContext) or setPreferencesPort; apps/desktop assembles the adapter (ADR-0001).',
            },
            {
              group: ['@vellum/renderer-webgl', '@vellum/renderer-webgl/*'],
              message:
                '@vellum/ui must not import the concrete renderer — depend on MapRendererPort / MapRendererFactory from @vellum/core; apps/desktop injects the adapter (ADR-0001).',
            },
            {
              group: ['maplibre-gl', 'maplibre-gl/*'],
              message:
                '@vellum/ui must not import MapLibre — it reaches the map only through MapRendererPort (ADR-0001).',
            },
            {
              group: ['@vellum/parser-cslmap', '@vellum/parser-cslmap/*'],
              message:
                'Dependencies point inward: @vellum/ui may depend on @vellum/theme-engine and @vellum/core only — parsing is assembled by apps/desktop (ADR-0001).',
            },
          ],
        },
      ],
    },
  },
  {
    // The renderer adapter is a leaf: `@vellum/core` and MapLibre, nothing else.
    files: ['packages/renderer-webgl/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...deepImportPatterns,
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
              message:
                '@vellum/renderer-webgl must stay framework-free — React belongs to @vellum/ui (ADR-0001).',
            },
            {
              group: ['@tauri-apps/*'],
              message:
                '@vellum/renderer-webgl must not depend on the desktop shell — Tauri is assembled only in apps/desktop (ADR-0001).',
            },
            {
              group: [
                '@vellum/ui',
                '@vellum/ui/*',
                '@vellum/theme-engine',
                '@vellum/theme-engine/*',
                '@vellum/parser-cslmap',
                '@vellum/parser-cslmap/*',
              ],
              message:
                'Dependencies point inward: @vellum/renderer-webgl may depend on @vellum/core only (ADR-0001).',
            },
          ],
        },
      ],
    },
  },
  {
    // El motor de temas es una hoja como el adapter: `@vellum/core` y nada más.
    files: ['packages/theme-engine/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...deepImportPatterns,
            {
              group: [
                '@vellum/ui',
                '@vellum/ui/*',
                '@vellum/renderer-webgl',
                '@vellum/renderer-webgl/*',
                '@vellum/parser-cslmap',
                '@vellum/parser-cslmap/*',
              ],
              message:
                'Dependencies point inward: @vellum/theme-engine may depend on @vellum/core only (ADR-0001).',
            },
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
              message:
                '@vellum/theme-engine must stay framework-free — React belongs to @vellum/ui (ADR-0001).',
            },
            {
              group: ['maplibre-gl', 'maplibre-gl/*'],
              message:
                '@vellum/theme-engine must not name a rendering technology — MapLibre belongs to @vellum/renderer-webgl (ADR-0001).',
            },
            {
              group: ['@tauri-apps/*'],
              message:
                '@vellum/theme-engine must not depend on the desktop shell — Tauri is assembled only in apps/desktop (ADR-0001).',
            },
          ],
        },
      ],
    },
  },
  {
    // El adapter de parsing es una hoja: `@vellum/core` y nada más.
    files: ['packages/parser-cslmap/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...deepImportPatterns,
            {
              group: [
                '@vellum/ui',
                '@vellum/ui/*',
                '@vellum/renderer-webgl',
                '@vellum/renderer-webgl/*',
                '@vellum/theme-engine',
                '@vellum/theme-engine/*',
              ],
              message:
                'Dependencies point inward: @vellum/parser-cslmap may depend on @vellum/core only (ADR-0001).',
            },
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
              message:
                '@vellum/parser-cslmap must stay framework-free — React belongs to @vellum/ui (ADR-0001).',
            },
            {
              group: ['maplibre-gl', 'maplibre-gl/*'],
              message:
                '@vellum/parser-cslmap must not name a rendering technology — MapLibre belongs to @vellum/renderer-webgl (ADR-0001).',
            },
            {
              group: ['@tauri-apps/*'],
              message:
                '@vellum/parser-cslmap must not depend on the desktop shell — Tauri is assembled only in apps/desktop (ADR-0001).',
            },
          ],
        },
      ],
    },
  },
];

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
      'no-restricted-imports': ['error', { patterns: deepImportPatterns }],
    },
  },
  ...dependencyDirectionScopes,
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
