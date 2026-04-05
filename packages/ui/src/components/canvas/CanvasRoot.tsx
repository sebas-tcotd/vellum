import { useRef, useEffect } from 'react';

interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}

interface CanvasRootProps {
  onElementHover?: (element: unknown) => void; // tipado real en Story 4.x
  onElementLeave?: () => void;
}

/**
 * Contenedor raíz del canvas de renderizado.
 *
 * Gestiona el loop de animación RAF y el estado del viewport mediante `useRef`
 * (nunca React state) para evitar re-renders constantes durante zoom/pan.
 * En Story 3.x montará los `CanvasLayer` por cada capa activa.
 */
export function CanvasRoot({ onElementHover: _onElementHover, onElementLeave: _onElementLeave }: CanvasRootProps) {
  // REGLA: viewport SIEMPRE en useRef, NUNCA en Zustand/React state
  // Razón: el viewport cambia a 30fps — React state causaría re-renders constantes
  const viewportRef = useRef<ViewportState>({ zoom: 1, panX: 0, panY: 0 });
  const rafIdRef = useRef<number>(0);
  const isActiveRef = useRef(true);

  useEffect(() => {
    isActiveRef.current = true;

    const tick = () => {
      if (!isActiveRef.current) return;
      // Story 3.x: renderer.updateViewport(viewportRef.current) irá aquí
      void viewportRef.current;
      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      isActiveRef.current = false;
      cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  return (
    <div className="canvas-root" style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* CanvasLayer por capa se añade en Story 3.x */}
    </div>
  );
}
