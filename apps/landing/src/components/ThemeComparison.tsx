import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { ImageLightbox } from './ImageLightbox';

type TransitView = 'transit' | 'dim';

const transitViews = {
  transit: {
    label: 'Transit',
    detail: 'Network brought forward',
    src: './assets/pepper-lake-theme-transit.webp',
    alt: 'Pepper Lake map in Vellum Transit theme with the network emphasized',
  },
  dim: {
    label: 'Transit dim',
    detail: 'Dimmed map, brighter network',
    src: './assets/pepper-lake-theme-transit-dim.webp',
    alt: 'Pepper Lake map in Vellum Transit dim theme with the network emphasized',
  },
} satisfies Record<
  TransitView,
  { label: string; detail: string; src: string; alt: string }
>;

export function ThemeComparison() {
  const [transitView, setTransitView] = useState<TransitView>('transit');
  const reduceMotion = useReducedMotion();
  const activeTransitView = transitViews[transitView];

  return (
    <>
      <div className="theme-comparison">
        <div className="theme-panel">
          <ImageLightbox
            src="./assets/pepper-lake-theme-day.webp"
            alt="Pepper Lake map in Vellum Day theme"
            label="Pepper Lake, Day theme"
          />
          <div className="theme-label">
            <span>Day</span>
            <small>Full map reading</small>
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
                alt={activeTransitView.alt}
                label={`Pepper Lake, ${activeTransitView.label} theme`}
              />
            </motion.div>
          </AnimatePresence>
          <div className="theme-label">
            <span>{activeTransitView.label}</span>
            <small>{activeTransitView.detail}</small>
          </div>
        </div>
      </div>

      <div
        className="theme-mode-control"
        role="group"
        aria-label="Transit map theme"
      >
        <span className="theme-mode-title">Transit view</span>
        <div className="theme-mode-options">
          {(Object.keys(transitViews) as TransitView[]).map((view) => (
            <button
              aria-pressed={transitView === view}
              className="theme-mode-option"
              key={view}
              onClick={() => setTransitView(view)}
              type="button"
            >
              {transitViews[view].label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
