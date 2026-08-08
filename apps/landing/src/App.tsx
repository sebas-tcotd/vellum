import {
  ArrowDown,
  ArrowUpRight,
  DownloadSimple,
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
const theme =
  new URLSearchParams(window.location.search).get('theme') === 'dark'
    ? 'dark'
    : 'paper';

/** Marketing page for the Vellum desktop map viewer. */
export function App() {
  return (
    <div className="site-shell" data-theme={theme}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <header className="site-header page-width">
        <a className="brand" href="#top" aria-label="Vellum home">
          <span className="brand-mark" aria-hidden="true">
            V
          </span>
          <span className="brand-name">Vellum</span>
        </a>

        <nav className="site-nav" aria-label="Primary navigation">
          <a href="#map">The map</a>
          <a href="#workflow">See how it works</a>
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
            <p className="eyebrow">A native map viewer for Cities: Skylines</p>
            <h1 id="hero-title">Your city, as a map.</h1>
            <p className="hero-lede">
              Vellum turns Cities: Skylines <code>.cslmap</code> exports into
              layered maps you can explore, share, and preserve.
            </p>
            <div className="hero-actions">
              <a className="button button-dark" href={releaseUrl}>
                Download Vellum
                <ArrowUpRight size={17} weight="bold" aria-hidden="true" />
              </a>
              <a className="text-link" href="#workflow">
                See how it works
                <ArrowDown size={15} weight="bold" aria-hidden="true" />
              </a>
            </div>
          </Reveal>

          <Reveal className="hero-visual" delay={0.08}>
            <figure className="map-figure map-figure-hero">
              <img
                src="/assets/vellum-map-placeholder-hero.webp"
                alt="Placeholder cartographic map showing terrain, water, roads, and transit layers"
              />
              <figcaption>
                <span>Placeholder map plate</span>
                <span>Replace with a real Vellum export</span>
              </figcaption>
            </figure>
          </Reveal>
        </section>

        <section
          className="manifesto page-width"
          aria-labelledby="manifesto-title"
        >
          <div className="section-rule" />
          <Reveal>
            <h2 id="manifesto-title">A virtual city deserves a proper map.</h2>
            <p>
              Cities built over hundreds of hours should not disappear into a
              save file or a cropped screenshot. Vellum makes the whole place
              readable.
            </p>
          </Reveal>
        </section>

        <section
          className="capabilities page-width"
          id="map"
          aria-labelledby="capabilities-title"
        >
          <Reveal className="section-intro">
            <h2 id="capabilities-title">See the city in layers.</h2>
            <p>
              Terrain, water, streets, transit, buildings, forests, and
              districts stay legible as one cartographic composition.
            </p>
          </Reveal>

          <div className="capability-layout">
            <Reveal className="capability-visual" delay={0.06}>
              <figure className="map-figure map-figure-detail">
                <img
                  src="/assets/vellum-map-detail-placeholder.webp"
                  alt="Placeholder map detail showing terrain contours, districts, and street hierarchy"
                />
                <figcaption>
                  <span>Placeholder map detail</span>
                  <span>Terrain / districts / streets</span>
                </figcaption>
              </figure>
            </Reveal>

            <div className="capability-list">
              <Reveal className="capability-item" delay={0.1}>
                <span className="capability-icon" aria-hidden="true">
                  <MapTrifold size={23} weight="regular" />
                </span>
                <div>
                  <h3>Read the terrain</h3>
                  <p>
                    Elevation, water, roads, buildings, forests, and districts
                    have room to speak.
                  </p>
                </div>
              </Reveal>

              <Reveal className="capability-item" delay={0.16}>
                <span className="capability-icon" aria-hidden="true">
                  <Train size={23} weight="regular" />
                </span>
                <div>
                  <h3>Follow the network</h3>
                  <p>
                    Inspect bus, metro, train, and tram lines over the streets
                    they serve.
                  </p>
                </div>
              </Reveal>

              <Reveal className="capability-item" delay={0.22}>
                <span className="capability-icon" aria-hidden="true">
                  <Export size={23} weight="regular" />
                </span>
                <div>
                  <h3>Keep the result</h3>
                  <p>
                    Export a PNG for sharing or an editable SVG for the next
                    pass.
                  </p>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        <section
          className="workflow page-width"
          id="workflow"
          aria-labelledby="workflow-title"
        >
          <Reveal className="workflow-heading">
            <h2 id="workflow-title">From export to artifact.</h2>
            <p>
              Start with the format Cities: Skylines already gives you. Vellum
              handles the map from there.
            </p>
          </Reveal>

          <ol className="workflow-list">
            <Reveal as="li" className="workflow-item">
              <span className="workflow-icon" aria-hidden="true">
                <DownloadSimple size={22} weight="regular" />
              </span>
              <div>
                <h3>Export</h3>
                <p>
                  Save a <code>.cslmap</code> file from Cities: Skylines.
                </p>
              </div>
            </Reveal>
            <Reveal as="li" className="workflow-item" delay={0.08}>
              <span className="workflow-icon" aria-hidden="true">
                <MapTrifold size={22} weight="regular" />
              </span>
              <div>
                <h3>Explore</h3>
                <p>
                  Zoom, pan, inspect transit, and control the layers that shape
                  the view.
                </p>
              </div>
            </Reveal>
            <Reveal as="li" className="workflow-item" delay={0.16}>
              <span className="workflow-icon" aria-hidden="true">
                <Export size={22} weight="regular" />
              </span>
              <div>
                <h3>Preserve</h3>
                <p>
                  Export a PNG or an editable SVG map for sharing, editing, or
                  keeping.
                </p>
              </div>
            </Reveal>
          </ol>
        </section>

        <section className="gallery page-width" aria-labelledby="gallery-title">
          <Reveal className="section-intro">
            <h2 id="gallery-title">Made to be looked at.</h2>
            <p>
              The map is the product. The interface stays quiet so the shape of
              the city can come forward.
            </p>
          </Reveal>

          <div className="gallery-layout">
            <Reveal className="gallery-main" delay={0.06}>
              <figure className="map-figure map-figure-transit">
                <img
                  src="/assets/vellum-transit-placeholder.webp"
                  alt="Placeholder transit map showing a layered network and station nodes"
                />
                <figcaption>
                  <span>Placeholder transit plate</span>
                  <span>Replace with a real Transit theme export</span>
                </figcaption>
              </figure>
            </Reveal>

            <Reveal className="gallery-note" delay={0.16}>
              <div className="gallery-note-mark" aria-hidden="true">
                V
              </div>
              <p>
                Open source under the MIT License. Built for people who care how
                their cities are seen.
              </p>
              <a className="text-link" href={repositoryUrl}>
                Explore the repository
                <ArrowUpRight size={15} weight="bold" aria-hidden="true" />
              </a>
            </Reveal>
          </div>
        </section>

        <section
          className="download-section page-width"
          aria-labelledby="download-title"
        >
          <Reveal className="download-copy">
            <h2 id="download-title">Bring your city into view.</h2>
            <p>
              Download Vellum from GitHub Releases and open your first{' '}
              <code>.cslmap</code> export.
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

      <footer className="site-footer page-width">
        <a className="brand" href="#top" aria-label="Vellum home">
          <span className="brand-mark" aria-hidden="true">
            V
          </span>
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
      </footer>
    </div>
  );
}
