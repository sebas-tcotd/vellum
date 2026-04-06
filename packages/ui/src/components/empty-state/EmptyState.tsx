// packages/ui/src/components/empty-state/EmptyState.tsx
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** localStorage key — prefijo 'vellum:' para evitar colisiones con otras apps. */
const HINT_STORAGE_KEY = 'vellum:hint-shown';

/** Delay en ms antes de mostrar el hint contextual en la primera sesión. */
const HINT_DELAY_MS = 4000;

/** Duración de la transición de fade-out del hint (debe coincidir con el CSS). */
const HINT_FADEOUT_MS = 300;

/**
 * Data URI del patrón SVG de cuadrícula cartográfica usado como fondo.
 * Opacidad ~5% — "se siente, no se ve" (AC 2, rango spec: 4–6%).
 * Se define fuera del componente para evitar recrearlo en cada render.
 */
const GRID_PATTERN_SVG = `url("data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M 40 0 L 0 0 0 40' fill='none' stroke='%23333' stroke-width='0.5'/%3E%3C/svg%3E")`;

/**
 * Fases del ciclo de vida del hint contextual.
 * - `hidden`  → no montado en el DOM
 * - `visible` → montado, fade-in via @keyframes `vellum-hint-fadein` (globals.css)
 * - `leaving` → montado, fade-out via `transition: opacity` — se desmonta tras 300ms
 */
type HintPhase = 'hidden' | 'visible' | 'leaving';

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
 * **Diseño de effects:** Dos effects con deps `[]` para que el listener de `dragenter`
 * no se elimine cuando `hintAlreadyShown` cambia al mostrarse el hint (AC 4).
 *
 * **Animaciones:** fade-in via `@keyframes vellum-hint-fadein` (globals.css).
 * Fade-out via máquina de estados `HintPhase` + `transition: opacity` con desmontaje
 * diferido 300ms para que la transición CSS complete antes de quitar el nodo del DOM.
 */
export function EmptyState() {
  const { t } = useTranslation();

  // Leer localStorage en el render (no en useEffect) para evitar el frame de flash
  const hintAlreadyShown = localStorage.getItem(HINT_STORAGE_KEY) === 'true';

  const [hintPhase, setHintPhase] = useState<HintPhase>('hidden');

  // Ref de la fase actual — usado dentro de los event listeners para evitar
  // closures obsoletas (los listeners se registran una sola vez con deps [])
  const hintPhaseRef = useRef<HintPhase>('hidden');

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Timer del fade-out — necesita limpiarse si el componente se desmonta durante la animación
  const fadeOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Effect 1: timer de primera sesión (AC 3, 5)
  useEffect(() => {
    if (hintAlreadyShown) return;

    timerRef.current = setTimeout(() => {
      localStorage.setItem(HINT_STORAGE_KEY, 'true'); // AC 5
      hintPhaseRef.current = 'visible';
      setHintPhase('visible');
    }, HINT_DELAY_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Effect 2: ocultar hint cuando el usuario arrastra un archivo (AC 4)
  // Escucha 'dragenter' (browser/dev) y 'vellum:drag-enter' (custom event desde
  // apps/desktop/src/main.tsx que bridges Tauri → browser para WebView2 en Windows)
  useEffect(() => {
    const handleDragEnter = () => {
      // Cancelar timer pendiente si el drag ocurre antes de los 4s
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      // Solo iniciar fade-out si el hint está visible
      if (hintPhaseRef.current !== 'visible') return;

      hintPhaseRef.current = 'leaving';
      setHintPhase('leaving');

      // Desmontar del DOM tras completar la transición CSS (300ms)
      fadeOutTimerRef.current = setTimeout(() => {
        hintPhaseRef.current = 'hidden';
        setHintPhase('hidden');
      }, HINT_FADEOUT_MS);
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('vellum:drag-enter', handleDragEnter as EventListener);
    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('vellum:drag-enter', handleDragEnter as EventListener);
      if (fadeOutTimerRef.current) clearTimeout(fadeOutTimerRef.current);
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
        zIndex: 10,
      }}
    >
      {/* Patrón de cuadrícula cartográfica — fondo sutil (AC 2) */}
      <div
        style={{
          backgroundImage: GRID_PATTERN_SVG,
          backgroundSize: '40px 40px',
          opacity: 0.05,
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

        {/* Hint contextual — fade-in al aparecer, fade-out al arrastrar (AC 3, 4, 5) */}
        {hintPhase !== 'hidden' && (
          <p
            role="status"
            aria-hidden={hintPhase === 'leaving'}
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '12px',
              color: 'var(--color-text-subtle)',
              margin: 0,
              maxWidth: '400px',
              // Ambas fases usan @keyframes (globals.css) — NO mezclar con opacity/transition
              // inline porque un estilo inline sobreescribe al keyframe inmediatamente.
              // `forwards` retiene el estado final (opacity:0) hasta que React desmonta el nodo.
              animation: hintPhase === 'visible'
                ? 'vellum-hint-fadein 300ms ease forwards'
                : hintPhase === 'leaving'
                ? 'vellum-hint-fadeout 300ms ease forwards'
                : undefined,
            }}
          >
            {t('emptyState.firstUseHint')}
          </p>
        )}
      </div>
    </div>
  );
}
