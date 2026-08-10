import { ArrowUpRightIcon } from '@phosphor-icons/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { ImageLightbox } from './ImageLightbox';

type TransitView = 'transit' | 'dim';

const transitViews = {
  transit: {
    label: 'Transit',
    detail: 'Network brought forward',
    src: './assets/spring-valley-transit-theme.webp',
    alt: 'Spring Valley map in Vellum Transit theme with the network emphasized',
  },
  dim: {
    label: 'Transit dim',
    detail: 'Dimmed map, brighter network',
    src: './assets/spring-valley-transit-theme-dim.webp',
    alt: 'Spring Valley map in Vellum Transit dim theme with the network emphasized',
  },
} satisfies Record<
  TransitView,
  { label: string; detail: string; src: string; alt: string }
>;

const workshopUrl =
  'https://steamcommunity.com/sharedfiles/filedetails/?id=1273431737';

export function TransitComparison() {
  const [transitView, setTransitView] = useState<TransitView>('transit');
  const reduceMotion = useReducedMotion();
  const activeTransitView = transitViews[transitView];

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
                alt={activeTransitView.alt}
                imageClassName="transit-image"
                label={`Spring Valley, ${activeTransitView.label} theme`}
              />
            </motion.div>
          </AnimatePresence>
        </div>
        <figcaption>
          <span>
            <strong>Spring Valley</strong>
            <small>{activeTransitView.label} theme · lines and stops</small>
          </span>
          <a
            className="workshop-link"
            href={workshopUrl}
            target="_blank"
            rel="noreferrer"
          >
            Steam Workshop
            <ArrowUpRightIcon size={13} weight="bold" aria-hidden="true" />
          </a>
        </figcaption>
      </figure>

      <div
        className="transit-mode-control"
        role="group"
        aria-label="Transit map theme"
      >
        <span className="transit-mode-title">Transit view</span>
        <div className="transit-mode-options">
          {(Object.keys(transitViews) as TransitView[]).map((view) => (
            <button
              aria-pressed={transitView === view}
              className="transit-mode-option"
              key={view}
              onClick={() => setTransitView(view)}
              type="button"
            >
              {transitViews[view].label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
