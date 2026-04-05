// Module augmentation para type-safe t()
// en.json es la SOURCE OF TRUTH — toda clave nueva va primero aquí.
// Con este módulo importado, t('clave.inexistente') es un error de compilación.

import type en from './locales/en.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {
      translation: typeof en;
    };
  }
}
