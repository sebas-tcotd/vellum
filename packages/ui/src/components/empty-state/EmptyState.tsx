// packages/ui/src/components/empty-state/EmptyState.tsx
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** localStorage key — prefijo 'vellum:' para evitar colisiones con otras apps. */
const HINT_STORAGE_KEY = 'vellum:hint-shown';

/** Delay en ms antes de mostrar el hint contextual en la primera sesión. */
const HINT_DELAY_MS = 4000;

/**
 * Data URI del patrón SVG de cuadrícula cartográfica usado como fondo.
 * Opacidad ~5% — "se siente, no se ve" (AC 2, rango spec: 4–6%).
 * Se define fuera del componente para evitar recrearlo en cada render.
 */
const GRID_PATTERN_SVG = `url("data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M 40 0 L 0 0 0 40' fill='none' stroke='%23333' stroke-width='0.5'/%3E%3C/svg%3E")`;

/**
 * Pantalla inicial que se muestra cuando no hay ningún mapa cargado.
 *
 * @remarks
 * **Scope de esta story (2.1):** Solo visual. El drag & drop real (Tauri events + IPC)
 * y la apertura via Ctrl+O se implementan en Story 2.2. Esta story escucha `dragenter`
 * únicamente para ocultar el hint contextual de onboarding.
 *
 * **Persistencia del hint:** Usa `localStorage` (no `tauri-plugin-store`) porque es
 * un dato de onboarding ligado al primer uso, no una preferencia del usuario.
 * Story 7.2 migrará las preferencias reales a `tauri-plugin-store`.
 *
 * **Diseño de effects:** Se usan dos effects separados con deps vacíos para evitar
 * que el cambio de `hintAlreadyShown` (cuando el hint se muestra) elimine el listener
 * de `dragenter` antes de que el usuario pueda interactuar con él (AC 4).
 */
export function EmptyState() {
  const { t } = useTranslation();

  // Leer localStorage en el render (no en useEffect) para evitar el frame de flash
  // donde el hint aparecería brevemente y luego desaparecería
  const hintAlreadyShown = localStorage.getItem(HINT_STORAGE_KEY) === 'true';
  const [hintVisible, setHintVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Effect 1: timer de primera sesión (AC 3, 5)
  // deps vacíos — captura `hintAlreadyShown` al montar; es el valor correcto para la
  // decisión de iniciar o no el timer
  useEffect(() => {
    if (hintAlreadyShown) return;

    timerRef.current = setTimeout(() => {
      setHintVisible(true);
      localStorage.setItem(HINT_STORAGE_KEY, 'true'); // AC 5: persistir para sesiones futuras
    }, HINT_DELAY_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Effect 2: ocultar hint cuando el usuario arrastra un archivo (AC 4)
  // Escucha dos eventos:
  //   - 'dragenter'          → drags internos de la página / entorno de dev (browser)
  //   - 'vellum:drag-enter'  → custom event despachado por apps/desktop/src/main.tsx
  //                            cuando Tauri detecta un drag externo del SO (WebView2 no
  //                            propaga el evento browser 'dragenter' para drags del explorador)
  useEffect(() => {
    const handleDragEnter = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setHintVisible(false);
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('vellum:drag-enter', handleDragEnter as EventListener);
    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('vellum:drag-enter', handleDragEnter as EventListener);
    };
  }, []);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--color-bg)',
        zIndex: 10, // encima del CanvasRoot (z-index < 10)
      }}
    >
      {/* Patrón de cuadrícula cartográfica — fondo sutil (AC 2) */}
      <div
        style={{
          backgroundImage: GRID_PATTERN_SVG,
          backgroundSize: '40px 40px',
          opacity: 0.05, // 5% — "se siente, no se ve" (rango spec: 4–6%)
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      />

      {/* Layout centrado */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px',
        }}
      >
        {/* Wordmark (AC 1) */}
        <h1
          style={{
            fontFamily: 'var(--font-wordmark)',
            fontSize: '32px',
            fontWeight: 400,
            letterSpacing: '0.05em',
            color: 'var(--color-text)',
            margin: 0,
          }}
        >
          {t('emptyState.title')}
        </h1>

        {/* Zona de drop — superficie identificable con borde discontinuo (AC 1) */}
        <div
          role="region"
          aria-label={t('emptyState.dropHint')}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            padding: '32px 48px',
            border: '1.5px dashed rgba(0, 0, 0, 0.20)',
            borderRadius: 'var(--radius-lg)',
            backgroundColor: 'rgba(0, 0, 0, 0.025)',
            minWidth: '320px',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '16px',
              color: 'var(--color-text-subtle)',
              margin: 0,
            }}
          >
            {t('emptyState.dropHint')}
          </p>

          {/* Atajo Ctrl+O — visual solo; listener real en Story 2.2 (AC 1) */}
          <p
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '14px',
              color: 'var(--color-text-subtle)',
              margin: 0,
            }}
          >
            {t('emptyState.orOpenWith')}{' '}
            <kbd
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                padding: '2px 6px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'rgba(0,0,0,0.04)',
              }}
            >
              {t('emptyState.openShortcut')}
            </kbd>
          </p>
        </div>

        {/* Hint contextual — primera sesión, aparece tras 4s de inactividad (AC 3, 4, 5) */}
        {hintVisible && (
          <p
            role="status"
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '12px',
              color: 'var(--color-text-subtle)',
              margin: 0,
              transition: 'opacity 300ms ease',
              maxWidth: '400px',
            }}
          >
            {t('emptyState.firstUseHint')}
          </p>
        )}
      </div>
    </div>
  );
}
