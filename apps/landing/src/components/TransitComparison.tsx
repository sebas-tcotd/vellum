import { ArrowUpRightIcon } from '@phosphor-icons/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { ImageLightbox } from './ImageLightbox';

type TransitView = 'transit' | 'dim';

const transitViews = {
  transit: {
    src: './assets/spring-valley-transit-theme.webp',
  },
  dim: {
    src: './assets/spring-valley-transit-theme-dim.webp',
  },
} satisfies Record<TransitView, { src: string }>;

const workshopUrl =
  'https://steamcommunity.com/sharedfiles/filedetails/?id=1273431737';

export function TransitComparison() {
  const { t } = useTranslation();
  const [transitView, setTransitView] = useState<TransitView>('transit');
  const reduceMotion = useReducedMotion();
  const activeTransitView = transitViews[transitView];
  const activeLabel = t(`transit.views.${transitView}.label`);
  const activeAlt = t(`transit.views.${transitView}.alt`);

  return (
    <div className="transit-map-viewer">
      <figure className="map-figure">
        <div className="map-frame transit-map-frame">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={transitView}
              className="transit-image-wrap"
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
                imageClassName="transit-image"
                label={t('transit.imageLabel', { view: activeLabel })}
              />
            </motion.div>
          </AnimatePresence>
        </div>
        <figcaption>
          <span>
            <strong>Spring Valley</strong>
            <small>{t('transit.imageDetail', { view: activeLabel })}</small>
          </span>
          <a
            className="workshop-link"
            href={workshopUrl}
            target="_blank"
            rel="noreferrer"
          >
            {t('common.workshop')}
            <ArrowUpRightIcon size={13} weight="bold" aria-hidden="true" />
          </a>
        </figcaption>
      </figure>

      <div
        className="transit-mode-control"
        role="group"
        aria-label={t('transit.ariaLabel')}
      >
        <span className="transit-mode-title">{t('transit.viewLabel')}</span>
        <div className="transit-mode-options">
          {(Object.keys(transitViews) as TransitView[]).map((view) => (
            <button
              aria-pressed={transitView === view}
              className="transit-mode-option"
              key={view}
              onClick={() => setTransitView(view)}
              type="button"
            >
              {t(`transit.views.${view}.label`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
