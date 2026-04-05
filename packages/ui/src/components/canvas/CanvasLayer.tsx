import { useRef } from 'react';

interface CanvasLayerProps {
  layerName: string; // ej: 'terrain', 'roads', 'transit'
  zIndex: number;
  visible: boolean;
}

/**
 * Canvas individual para una capa de renderizado.
 *
 * La visibilidad se controla mediante `opacity` CSS — el canvas nunca se desmonta
 * para evitar pérdida de contexto de renderizado. En Story 3.x, `canvasRef` se
 * pasará al renderer para obtener el contexto Canvas 2D.
 */
export function CanvasLayer({ layerName, zIndex, visible }: CanvasLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // canvasRef se usará en Story 3.x para obtener el contexto de renderizado
  void canvasRef;

  return (
    <canvas
      ref={canvasRef}
      id={`layer-${layerName}`} // naming: layer-{name} kebab-case
      style={{
        position: 'absolute',
        inset: 0,
        zIndex,
        opacity: visible ? 1 : 0, // fade gestionado por CSS opacity, no desmontando el canvas
        transition: 'opacity 200ms ease',
      }}
    />
  );
}
