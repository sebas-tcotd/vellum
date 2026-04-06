// packages/ui/src/App.tsx
import { Suspense, useEffect, useState } from 'react';
import { CanvasRoot } from './components/canvas/CanvasRoot';
import { initI18n } from './i18n/i18n-setup';

/**
 * Global type augmentation for i18next.
 * @remarks
 * **CRITICAL INVARIANT:** This import must remain at the top level of the application 
 * to ensure strict type-checking for the `t()` function is activated globally across 
 * the entire React component tree.
 */
import './i18n/types'; 

import { useVellumStore } from './store/vellum-store';

/**
 * The root React component of the Vellum desktop application.
 * @remarks
 * **Lifecycle Invariant (Localization):** The UI is strictly blocked from rendering 
 * (returning `null`) until the asynchronous `initI18n()` routine completes. This 
 * guarantees that users never experience a "flash of unlocalized content" or see 
 * raw translation keys on startup.
 * 
 * **State Synchronization:** This component is solely responsible for invoking 
 * the store's `syncActiveLanguage` to align the Zustand state with the implicitly 
 * detected OS language at boot time, preventing initialization loops.
 * 
 * **Future Implementation (Story 2.1):** An `<EmptyState />` component will be 
 * injected over the canvas to handle the scenario where no `.cslmap` is loaded yet.
 */
export function App() {
  const [i18nReady, setI18nReady] = useState(false);
  const syncActiveLanguage = useVellumStore((s) => s.syncActiveLanguage);

  useEffect(() => {
    initI18n().then((detectedLang) => {
      syncActiveLanguage(detectedLang);
      setI18nReady(true);
    });
  }, [syncActiveLanguage]);

  // Evitar flash en idioma incorrecto — no renderizar hasta que i18n esté listo
  if (!i18nReady) return null;

  return (
    <Suspense fallback={null}>
      <div style={{ width: '100vw', height: '100vh' }}>
        <CanvasRoot />
        {/* Story 2.1 will append <EmptyState /> here */}
      </div>
    </Suspense>
  );
}