import { useRef } from 'react';

interface CanvasLayerProps {
  layerName: string; // ej: 'terrain', 'roads', 'transit'
  zIndex: number;
  visible: boolean;
}

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
