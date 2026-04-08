// packages/ui/src/components/empty-state/GridBackground.tsx

/**
 * Patrón de cuadrícula cartográfica usado como fondo del EmptyState.
 * Opacidad ~5% — "se siente, no se ve" (AC 2, rango spec: 4–6%).
 * Se define fuera del componente para evitar recrearlo en cada render.
 */
const GRID_PATTERN_SVG = `url("data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M 40 0 L 0 0 0 40' fill='none' stroke='%23333' stroke-width='0.5'/%3E%3C/svg%3E")`;

export function GridBackground() {
  return (
    <div
      className="absolute inset-0 pointer-events-none opacity-5"
      style={{ backgroundImage: GRID_PATTERN_SVG, backgroundSize: '40px 40px' }}
      aria-hidden="true"
    />
  );
}
