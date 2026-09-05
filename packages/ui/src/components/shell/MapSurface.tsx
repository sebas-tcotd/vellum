import type { ReactNode } from 'react';

export interface MapSurfaceProps {
  children: ReactNode;
}

/** Superficie flexible y siempre opaca que aísla el mapa del material nativo. */
export function MapSurface({ children }: MapSurfaceProps) {
  return (
    <main className="map-surface" data-testid="map-surface">
      {children}
    </main>
  );
}
