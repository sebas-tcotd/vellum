import { Suspense, useEffect, useState } from 'react';
import { initI18n } from './i18n/i18n-setup';
import './i18n/types'; // importar para activar module augmentation globalmente
import { CanvasRoot } from './components/canvas/CanvasRoot';

/** Componente raíz de la aplicación. Montado desde `apps/desktop/src/main.tsx`. */
export function App() {
  const [i18nReady, setI18nReady] = useState(false);

  useEffect(() => {
    initI18n().then(() => setI18nReady(true));
  }, []);

  // Evitar flash en idioma incorrecto — no renderizar hasta que i18n esté listo
  if (!i18nReady) return null;

  return (
    <Suspense fallback={null}>
      <div style={{ width: '100vw', height: '100vh' }}>
        <CanvasRoot />
        {/* Story 2.1 añadirá <EmptyState /> aquí */}
      </div>
    </Suspense>
  );
}
