// packages/ui/src/components/empty-state/useHintCycle.ts
import { useEffect, useRef, useState } from 'react';

const HINT_STORAGE_KEY = 'vellum:hint-shown';
const HINT_DELAY_MS = 4000;
const HINT_FADEOUT_MS = 300;

/**
 * Fases del ciclo de vida del hint contextual.
 * - `hidden`  → no montado en el DOM
 * - `visible` → montado, fade-in via _@keyframes_ `vellum-hint-fadein` (globals.css)
 * - `leaving` → montado, fade-out — se desmonta tras HINT_FADEOUT_MS
 */
export type HintPhase = 'hidden' | 'visible' | 'leaving';

/**
 * Encapsula el ciclo de vida completo del hint contextual de onboarding:
 * timer de primera sesión, persistencia en localStorage, y escucha de
 * eventos drag para iniciar el fade-out.
 *
 * @remarks
 * Dos effects separados para que el listener de `dragenter` no se elimine
 * cuando `hintPhase` cambia al mostrarse el hint (AC 4).
 * `hintPhaseRef` evita closures obsoletas dentro de los event listeners
 * registrados una sola vez con deps `[]`.
 */
export function useHintCycle(): HintPhase {
  const hintAlreadyShown = localStorage.getItem(HINT_STORAGE_KEY) === 'true';

  const [hintPhase, setHintPhase] = useState<HintPhase>('hidden');
  const hintPhaseRef = useRef<HintPhase>('hidden');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Effect 1: timer de primera sesión (AC 3, 5)
  useEffect(() => {
    if (hintAlreadyShown) return;

    timerRef.current = setTimeout(() => {
      localStorage.setItem(HINT_STORAGE_KEY, 'true');
      hintPhaseRef.current = 'visible';
      setHintPhase('visible');
    }, HINT_DELAY_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Effect 2: ocultar hint al drag (AC 4)
  // Escucha 'dragenter' (browser/dev) y 'vellum:drag-enter' (custom event desde
  // apps/desktop/src/main.tsx que bridges Tauri → browser para WebView2 en Windows)
  useEffect(() => {
    const handleDragEnter = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      if (hintPhaseRef.current !== 'visible') return;

      hintPhaseRef.current = 'leaving';
      setHintPhase('leaving');

      fadeOutTimerRef.current = setTimeout(() => {
        hintPhaseRef.current = 'hidden';
        setHintPhase('hidden');
      }, HINT_FADEOUT_MS);
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener(
      'vellum:drag-enter',
      handleDragEnter as EventListener,
    );

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener(
        'vellum:drag-enter',
        handleDragEnter as EventListener,
      );
      if (fadeOutTimerRef.current) clearTimeout(fadeOutTimerRef.current);
    };
  }, []);

  return hintPhase;
}
