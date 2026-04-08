import type en from './locales/en.json';

/**
 * Module augmentation for `i18next` to enforce strict, end-to-end type safety for translation keys.
 * @remarks
 * **CRITICAL INVARIANT:** The `en.json` file is the absolute SOURCE OF TRUTH for all localized strings.
 * Any new translation key MUST be added to the English base file first before being used in the code.
 *
 * By mapping the `resources` interface to the inferred type of `en.json`, the TypeScript compiler
 * will automatically validate all invocations of the `t()` function across the entire frontend.
 * Attempting to use an undefined, misspelled, or obsolete translation key (e.g., `t('missing.key')`)
 * will trigger a fatal compile-time error, completely eliminating missing translation bugs at runtime.
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {
      translation: typeof en;
    };
  }
}
