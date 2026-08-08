import {
  ArrowDown,
  ArrowUpRight,
  Export,
  GithubLogo,
  MapTrifold,
  Train,
} from '@phosphor-icons/react';
import { Reveal } from './components/Reveal';

const releaseUrl = 'https://github.com/sebas-tcotd/vellum/releases/latest';
const repositoryUrl = 'https://github.com/sebas-tcotd/vellum';
const licenseUrl = `${repositoryUrl}/blob/main/LICENSE`;
const documentationUrl = `${repositoryUrl}/tree/main/docs`;
const cslMapViewUrl =
  'https://steamcommunity.com/sharedfiles/filedetails/?id=845665815';

interface PlaceholderFigureProps {
  alt: string;
  className?: string;
  imageClassName?: string;
  imageSrc: string;
  title: string;
  detail: string;
}

function PlaceholderFigure({
  alt,
  className = '',
  imageClassName = '',
  imageSrc,
  title,
  detail,
}: PlaceholderFigureProps) {
  return (
    <figure className={`map-figure ${className}`}>
      <div className="placeholder-frame">
        <img className={imageClassName} src={imageSrc} alt={alt} />
        <span className="placeholder-stamp">Placeholder visual</span>
      </div>
      <figcaption>
        <span>{title}</span>
        <span>{detail}</span>
      </figcaption>
    </figure>
  );
}

/** Marketing page for the Vellum desktop map viewer. */
export function App() {
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <header className="site-header page-width">
        <a className="brand" href="#top" aria-label="Vellum home">
          <img
            className="brand-isotype"
            src="./assets/vellum-isotype-rounded.svg"
            alt=""
            aria-hidden="true"
          />
          <span className="brand-name">Vellum</span>
        </a>

        <nav className="site-nav" aria-label="Primary navigation">
          <a href="#map">The map</a>
          <a href="#workflow">The workflow</a>
          <a href="#open-source">Open source</a>
          <a href={repositoryUrl}>GitHub</a>
        </nav>

        <a className="button button-small button-dark" href={releaseUrl}>
          Download Vellum
          <ArrowUpRight size={15} weight="bold" aria-hidden="true" />
        </a>
      </header>

      <main id="main-content">
        <section
          className="hero page-width"
          id="top"
          aria-labelledby="hero-title"
        >
          <Reveal className="hero-copy">
            <p className="eyebrow">Desktop map viewer for Cities: Skylines 1</p>
            <h1 id="hero-title">A map for the city you built.</h1>
            <p className="hero-lede">
              Open a <code>.cslmap</code> export, explore your city in layers,
              and keep the map in PNG or SVG.
            </p>
            <div className="hero-actions">
              <a className="button button-dark" href={releaseUrl}>
                Download Vellum
                <ArrowUpRight size={17} weight="bold" aria-hidden="true" />
              </a>
              <a className="text-link" href="#workflow">
                See the workflow
                <ArrowDown size={15} weight="bold" aria-hidden="true" />
              </a>
            </div>
          </Reveal>

          <Reveal className="hero-visual" delay={0.08}>
            <PlaceholderFigure
              className="map-figure-hero"
              imageClassName="map-image-hero"
              imageSrc="./assets/vellum-map-placeholder-hero.webp"
              alt="Placeholder for a Vellum map export showing terrain, water, roads, and transit layers"
              title="Real Vellum map export needed"
              detail="Hero map visual"
            />
          </Reveal>
        </section>

        <section className="promise page-width" aria-labelledby="promise-title">
          <div className="section-rule" />
          <Reveal>
            <h2 id="promise-title">
              Your city should be readable outside the game.
            </h2>
            <p>
              Vellum turns a Cities: Skylines export into a map you can inspect,
              share, and preserve.
            </p>
          </Reveal>
        </section>

        <section
          className="layers page-width"
          id="map"
          aria-labelledby="layers-title"
        >
          <Reveal className="section-intro">
            <h2 id="layers-title">See the city in layers.</h2>
            <p>
              Terrain, water, streets, transit, buildings, forests, and
              districts stay legible as one composition.
            </p>
          </Reveal>

          <div className="layers-layout">
            <Reveal className="layers-visual" delay={0.06}>
              <PlaceholderFigure
                imageSrc="./assets/vellum-map-detail-placeholder.webp"
                alt="Placeholder for a detailed Vellum map export showing terrain, districts, and street hierarchy"
                title="Real map detail needed"
                detail="Layers and street hierarchy"
              />
            </Reveal>

            <ul className="layer-grid" aria-label="Vellum map layers">
              <Reveal as="li" className="layer-item" delay={0.08}>
                <span className="layer-mark" aria-hidden="true">
                  <MapTrifold size={19} weight="regular" />
                </span>
                <div>
                  <h3>Terrain and water</h3>
                  <p>Elevation, land, and water form the map base.</p>
                </div>
              </Reveal>
              <Reveal as="li" className="layer-item" delay={0.12}>
                <span className="layer-mark" aria-hidden="true">
                  <MapTrifold size={19} weight="regular" />
                </span>
                <div>
                  <h3>Roads</h3>
                  <p>Street hierarchy remains visible across the city.</p>
                </div>
              </Reveal>
              <Reveal as="li" className="layer-item" delay={0.16}>
                <span className="layer-mark" aria-hidden="true">
                  <Train size={19} weight="regular" />
                </span>
                <div>
                  <h3>Transit</h3>
                  <p>Inspect lines and stops over the network they serve.</p>
                </div>
              </Reveal>
              <Reveal as="li" className="layer-item" delay={0.2}>
                <span className="layer-mark" aria-hidden="true">
                  <MapTrifold size={19} weight="regular" />
                </span>
                <div>
                  <h3>Buildings</h3>
                  <p>Keep the built shape of the city in view.</p>
                </div>
              </Reveal>
              <Reveal as="li" className="layer-item" delay={0.24}>
                <span className="layer-mark" aria-hidden="true">
                  <MapTrifold size={19} weight="regular" />
                </span>
                <div>
                  <h3>Forests</h3>
                  <p>Read the green structure between roads and districts.</p>
                </div>
              </Reveal>
              <Reveal as="li" className="layer-item" delay={0.28}>
                <span className="layer-mark" aria-hidden="true">
                  <MapTrifold size={19} weight="regular" />
                </span>
                <div>
                  <h3>Districts</h3>
                  <p>Use district markers to orient yourself at a glance.</p>
                </div>
              </Reveal>
            </ul>
          </div>
        </section>

        <section
          className="exploration page-width"
          aria-labelledby="exploration-title"
        >
          <div className="exploration-copy">
            <Reveal>
              <h2 id="exploration-title">Follow the network.</h2>
              <p>
                Pan and zoom across the full city, control the layers, inspect
                transit, and use the minimap to stay oriented.
              </p>
            </Reveal>
          </div>

          <Reveal className="exploration-note" delay={0.08}>
            <div className="exploration-icon" aria-hidden="true">
              <Train size={25} weight="regular" />
            </div>
            <p>
              Transit remains part of the map, not a separate report. Bring the
              network forward when it is the story.
            </p>
          </Reveal>
        </section>

        <section
          className="workflow page-width"
          id="workflow"
          aria-labelledby="workflow-title"
        >
          <Reveal className="workflow-heading">
            <h2 id="workflow-title">From export to artifact.</h2>
            <p>
              Vellum uses the community&apos;s established export path for its
              first release.
            </p>
          </Reveal>

          <ol className="workflow-list">
            <Reveal as="li" className="workflow-item">
              <span className="workflow-icon" aria-hidden="true">
                <ArrowUpRight size={20} weight="regular" />
              </span>
              <div>
                <h3>Get a .cslmap</h3>
                <p>
                  Export your city with <a href={cslMapViewUrl}>CSL Map View</a>
                  , the current community exporter.
                </p>
              </div>
            </Reveal>
            <Reveal as="li" className="workflow-item" delay={0.08}>
              <span className="workflow-icon" aria-hidden="true">
                <MapTrifold size={20} weight="regular" />
              </span>
              <div>
                <h3>Open and explore</h3>
                <p>
                  Drop the file into Vellum, then pan, zoom, inspect, and
                  control the layers.
                </p>
              </div>
            </Reveal>
            <Reveal as="li" className="workflow-item" delay={0.16}>
              <span className="workflow-icon" aria-hidden="true">
                <Export size={20} weight="regular" />
              </span>
              <div>
                <h3>Export the result</h3>
                <p>
                  Save a PNG for sharing or an editable SVG for the next pass.
                </p>
              </div>
            </Reveal>
          </ol>
        </section>

        <section
          className="evidence page-width"
          aria-labelledby="evidence-title"
        >
          <Reveal className="section-intro">
            <h2 id="evidence-title">The map is the product.</h2>
            <p>
              The interface stays quiet so the shape of the city can come
              forward.
            </p>
          </Reveal>

          <div className="evidence-layout">
            <Reveal className="evidence-visual" delay={0.06}>
              <PlaceholderFigure
                className="map-figure-evidence"
                imageClassName="map-image-evidence"
                imageSrc="./assets/vellum-transit-placeholder.webp"
                alt="Placeholder for a Vellum transit map export showing a layered network"
                title="Real transit export needed"
                detail="Transit-focused map visual"
              />
            </Reveal>

            <Reveal className="evidence-note" delay={0.14}>
              <p className="evidence-mark">PNG / SVG</p>
              <h3>Keep the view you made.</h3>
              <p>
                Export the current map as a PNG or an editable SVG for sharing,
                editing, or keeping.
              </p>
            </Reveal>
          </div>
        </section>

        <section
          className="open-source page-width"
          id="open-source"
          aria-labelledby="open-source-title"
        >
          <Reveal className="open-source-copy">
            <h2 id="open-source-title">Open by design.</h2>
            <p>
              Vellum is open source under the MIT License. Read the code, follow
              the documentation, and see how the map is made.
            </p>
          </Reveal>
          <Reveal className="open-source-links" delay={0.08}>
            <a className="text-link" href={repositoryUrl}>
              <GithubLogo size={17} weight="regular" aria-hidden="true" />
              Explore the repository
              <ArrowUpRight size={15} weight="bold" aria-hidden="true" />
            </a>
            <a className="text-link" href={documentationUrl}>
              Read the documentation
              <ArrowUpRight size={15} weight="bold" aria-hidden="true" />
            </a>
          </Reveal>
        </section>

        <section
          className="download-section page-width"
          id="download"
          aria-labelledby="download-title"
        >
          <Reveal className="download-copy">
            <h2 id="download-title">Bring your city into view.</h2>
            <p>
              Download Vellum from GitHub Releases and open your first .cslmap
              export.
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <a className="button button-light" href={releaseUrl}>
              Download Vellum
              <ArrowUpRight size={17} weight="bold" aria-hidden="true" />
            </a>
          </Reveal>
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-footer-inner page-width">
          <div className="footer-main">
            <a className="brand" href="#top" aria-label="Vellum home">
              <img
                className="brand-isotype"
                src="./assets/vellum-isotype-rounded.svg"
                alt=""
                aria-hidden="true"
              />
              <span className="brand-name">Vellum</span>
            </a>
            <p>Maps for cities worth remembering.</p>
            <nav className="footer-nav" aria-label="Footer navigation">
              <a href={repositoryUrl}>
                <GithubLogo size={16} weight="regular" aria-hidden="true" />
                GitHub
              </a>
              <a href={licenseUrl}>MIT License</a>
              <a href={documentationUrl}>Documentation</a>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
