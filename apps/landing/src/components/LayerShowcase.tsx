import {
  ArrowUpRight,
  Buildings,
  MapTrifold,
  RoadHorizon,
  Train,
  Tree,
} from '@phosphor-icons/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useRef, useState } from 'react';
import { ImageLightbox } from './ImageLightbox';

const layerSteps = [
  {
    id: 'terrain-base-map',
    label: 'Terrain and base map',
    detail: 'Land shape and water establish the first reading.',
    src: './assets/pepper-lake-layer-01-terrain-water.webp',
    alt: 'Pepper Lake terrain and base map layers in Vellum',
    icon: 'map',
  },
  {
    id: 'roads',
    label: 'Roads',
    detail: 'Street hierarchy gives the city its structure.',
    src: './assets/pepper-lake-layer-02-roads.webp',
    alt: 'Pepper Lake roads layer in Vellum',
    icon: 'roads',
  },
  {
    id: 'buildings',
    label: 'Buildings',
    detail: 'The built shape settles into the network.',
    src: './assets/pepper-lake-layer-03-buildings.webp',
    alt: 'Pepper Lake buildings layer in Vellum',
    icon: 'buildings',
  },
  {
    id: 'forests',
    label: 'Forests',
    detail: 'Green structure fills the spaces between districts.',
    src: './assets/pepper-lake-layer-04-forests.webp',
    alt: 'Pepper Lake forests layer in Vellum',
    icon: 'tree',
  },
  {
    id: 'districts',
    label: 'Districts',
    detail: 'Boundaries make the city easier to read at a glance.',
    src: './assets/pepper-lake-layer-05-districts.webp',
    alt: 'Pepper Lake districts layer in Vellum',
    icon: 'map',
  },
  {
    id: 'transit',
    label: 'Transit',
    detail: 'Lines and stops bring movement to the finished map.',
    src: './assets/pepper-lake-layer-06-transit.webp',
    alt: 'Pepper Lake transit layer in Vellum',
    icon: 'train',
  },
] as const;

function LayerIcon({ kind }: { kind: (typeof layerSteps)[number]['icon'] }) {
  if (kind === 'roads') return <RoadHorizon size={18} weight="regular" />;
  if (kind === 'buildings') return <Buildings size={18} weight="regular" />;
  if (kind === 'tree') return <Tree size={18} weight="regular" />;
  if (kind === 'train') return <Train size={18} weight="regular" />;
  return <MapTrifold size={18} weight="regular" />;
}

export function LayerShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);
  const reduceMotion = useReducedMotion();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeLayer = layerSteps[activeIndex];

  const selectLayer = (index: number, moveFocus = false) => {
    const nextIndex = (index + layerSteps.length) % layerSteps.length;
    setActiveIndex(nextIndex);
    if (moveFocus) tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="layer-showcase">
      <div
        className="layer-showcase-visual"
        id="layer-panel"
        role="tabpanel"
        aria-labelledby={`layer-tab-${activeLayer.id}`}
        tabIndex={0}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeLayer.id}
            className="layer-showcase-image-wrap"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.38, ease: 'easeOut' }}
          >
            <ImageLightbox
              src={activeLayer.src}
              alt={activeLayer.alt}
              imageClassName="layer-showcase-image"
              label={`Pepper Lake, ${activeLayer.label}`}
            />
          </motion.div>
        </AnimatePresence>
        <div className="layer-showcase-caption">
          <span>Pepper Lake</span>
          <span>{activeLayer.label}</span>
        </div>
      </div>

      <div className="layer-showcase-controls">
        <div className="layer-showcase-heading">
          <p className="section-kicker">Progressive layers</p>
          <p>{activeLayer.detail}</p>
        </div>
        <div
          className="layer-tabs"
          role="tablist"
          aria-label="Pepper Lake map layers"
        >
          {layerSteps.map((layer, index) => (
            <button
              aria-controls="layer-panel"
              aria-selected={index === activeIndex}
              className={`layer-tab ${index === activeIndex ? 'is-active' : ''}`}
              id={`layer-tab-${layer.id}`}
              key={layer.id}
              onClick={() => selectLayer(index)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                  event.preventDefault();
                  selectLayer(index + 1, true);
                }
                if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  selectLayer(index - 1, true);
                }
                if (event.key === 'Home') {
                  event.preventDefault();
                  selectLayer(0, true);
                }
                if (event.key === 'End') {
                  event.preventDefault();
                  selectLayer(layerSteps.length - 1, true);
                }
              }}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              role="tab"
              tabIndex={index === activeIndex ? 0 : -1}
              type="button"
            >
              <span className="layer-tab-icon" aria-hidden="true">
                <LayerIcon kind={layer.icon} />
              </span>
              <span>{layer.label}</span>
              <span className="layer-tab-index">0{index + 1}</span>
            </button>
          ))}
        </div>
        <p className="layer-showcase-source">
          Pepper Lake · Day theme ·{' '}
          <a
            href="https://steamcommunity.com/sharedfiles/filedetails/?id=1568162351"
            target="_blank"
            rel="noreferrer"
          >
            Steam Workshop{' '}
            <ArrowUpRight size={12} weight="bold" aria-hidden="true" />
          </a>
        </p>
      </div>
    </div>
  );
}
