// packages/ui/src/components/empty-state/DropZone.tsx
import type { ReactNode } from 'react';

interface DropZoneProps {
  /** Etiqueta accesible para lectores de pantalla. */
  label: string;
  children: ReactNode;
}

/**
 * Superficie visual de la zona de drop: borde discontinuo, fondo sutil.
 * No maneja lógica de drag & drop — eso corresponde a Story 2.2.
 */
export function DropZone({ label, children }: DropZoneProps) {
  return (
    <div
      role="region"
      aria-label={label}
      className="flex flex-col items-center gap-3 py-8 px-12 border-[1.5px] border-dashed border-black/20 rounded-(--radius-lg) bg-black/[0.025] min-w-80"
    >
      {children}
    </div>
  );
}
