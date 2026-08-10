import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { ImageLightbox } from './ImageLightbox';

type TransitView = 'transit' | 'dim';

const transitViews = {
  transit: {
    src: './assets/pepper-lake-theme-transit.webp',
  },
  dim: {
    src: './assets/pepper-lake-theme-transit-dim.webp',
  },
} satisfies Record<TransitView, { src: string }>;

export function ThemeComparison() {
  const { t } = useTranslation();
  const [transitView, setTransitView] = useState<TransitView>('transit');
  const reduceMotion = useReducedMotion();
  const activeTransitView = transitViews[transitView];
  const activeLabel = t(`themes.${transitView}.label`);
  const activeDetail = t(`themes.${transitView}.detail`);
  const activeAlt = t(`themes.${transitView}.alt`);

  return (
    <>
      <div className="theme-comparison">
        <div className="theme-panel">
          <ImageLightbox
            src="./assets/pepper-lake-theme-day.webp"
            alt={t('themes.dayAlt')}
            label={t('themes.dayImageLabel')}
          />
          <div className="theme-label">
            <span>{t('themes.dayLabel')}</span>
            <small>{t('themes.dayDetail')}</small>
          </div>
        </div>
        <div className="theme-panel theme-panel-transit">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={transitView}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: reduceMotion ? 0 : 0.32,
                ease: 'easeOut',
              }}
            >
              <ImageLightbox
                src={activeTransitView.src}
                alt={activeAlt}
                label={t('themes.transitImageLabel', { view: activeLabel })}
              />
            </motion.div>
          </AnimatePresence>
          <div className="theme-label">
            <span>{activeLabel}</span>
            <small>{activeDetail}</small>
          </div>
        </div>
      </div>

      <div
        className="theme-mode-control"
        role="group"
        aria-label={t('themes.ariaLabel')}
      >
        <span className="theme-mode-title">{t('themes.modeLabel')}</span>
        <div className="theme-mode-options">
          {(Object.keys(transitViews) as TransitView[]).map((view) => (
            <button
              aria-pressed={transitView === view}
              className="theme-mode-option"
              key={view}
              onClick={() => setTransitView(view)}
              type="button"
            >
              {t(`themes.${view}.label`)}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
