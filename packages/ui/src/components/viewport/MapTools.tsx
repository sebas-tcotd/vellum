import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';

/** Groups the map's document, camera and minimap tools in one flex region. */
export function MapTools({ children }: { children: ReactNode }) {
  const { t } = useTranslation();

  return (
    <aside
      className="map-tools"
      data-testid="map-tools"
      aria-label={t('a11y.mapTools')}
    >
      {children}
    </aside>
  );
}
