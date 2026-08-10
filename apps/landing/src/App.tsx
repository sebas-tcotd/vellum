import {
  ArrowDown,
  ArrowUpRight,
  Export,
  GithubLogo,
  Heart,
  MapTrifold,
  Palette,
  Train,
} from '@phosphor-icons/react';
import { LayerShowcase } from './components/LayerShowcase';
import { ImageLightbox } from './components/ImageLightbox';
import { Reveal } from './components/Reveal';
import { ThemeSelector } from './components/ThemeSelector';
import { ThemeComparison } from './components/ThemeComparison';
import { TransitComparison } from './components/TransitComparison';

const releaseUrl = 'https://github.com/sebas-tcotd/vellum/releases/latest';
const repositoryUrl = 'https://github.com/sebas-tcotd/vellum';
const licenseUrl = `${repositoryUrl}/blob/main/LICENSE`;
const documentationUrl = `${repositoryUrl}/tree/main/docs`;
const cslMapViewUrl =
  'https://steamcommunity.com/sharedfiles/filedetails/?id=845665815';

const workshop = {
  islandHopping:
    'https://steamcommunity.com/sharedfiles/filedetails/?id=2475283323',
  pepperLake:
    'https://steamcommunity.com/sharedfiles/filedetails/?id=1568162351',
  sanRico: 'https://steamcommunity.com/sharedfiles/filedetails/?id=3000569752',
  springValley:
    'https://steamcommunity.com/sharedfiles/filedetails/?id=1273431737',
  atlanticKeys:
    'https://steamcommunity.com/sharedfiles/filedetails/?id=3543847424',
  costaTijuca:
    'https://steamcommunity.com/sharedfiles/filedetails/?id=3346079784',
};

interface MapFigureProps {
  alt: string;
  className?: string;
  imageClassName?: string;
  imageSrc: string;
  city: string;
  detail: string;
  workshopUrl: string;
}

function WorkshopLink({ href }: { href: string }) {
  return (
    <a className="workshop-link" href={href} target="_blank" rel="noreferrer">
      Steam Workshop
      <ArrowUpRight size={13} weight="bold" aria-hidden="true" />
    </a>
  );
}

function MapFigure({
  alt,
  className = '',
  imageClassName = '',
  imageSrc,
  city,
  detail,
  workshopUrl,
}: MapFigureProps) {
  return (
    <figure className={`map-figure ${className}`}>
      <div className="map-frame">
        <ImageLightbox
          src={imageSrc}
          alt={alt}
          imageClassName={imageClassName}
          label={`${city}, ${detail}`}
        />
      </div>
      <figcaption>
        <span>
          <strong>{city}</strong>
          <small>{detail}</small>
        </span>
        <WorkshopLink href={workshopUrl} />
      </figcaption>
    </figure>
  );
}

function Brand({ footer = false }: { footer?: boolean }) {
  return (
    <a className="brand" href="#top" aria-label="Vellum home">
      <img
        className="brand-isotype"
        src="./assets/vellum-isotype-rounded.svg"
        alt=""
        aria-hidden="true"
      />
      <span className={footer ? 'brand-name brand-name-footer' : 'brand-name'}>
        Vellum
      </span>
    </a>
  );
}

const gallery = [
  {
    city: 'Island Hopping',
    detail: 'Day theme · a city spread across water',
    src: './assets/island-hopping-day-gallery.webp',
    alt: 'Island Hopping map with a dense connected city distributed across islands',
    workshopUrl: workshop.islandHopping,
    className: 'gallery-card-wide',
  },
  {
    city: '웨스트데일',
    detail: 'Atlantic Keys · Day theme',
    src: './assets/westdale-day-gallery.webp',
    alt: 'Westdale map showing a dense coastal city and surrounding water',
    workshopUrl: workshop.atlanticKeys,
    className: 'gallery-card-tall',
  },
  {
    city: 'San Rico',
    detail: 'Day theme · islands, bridges, and transit corridors',
    src: './assets/san-rico-day-gallery.webp',
    alt: 'San Rico map showing islands, bridges, roads, and a central city',
    workshopUrl: workshop.sanRico,
    className: '',
  },
  {
    city: 'Costa Tijuca',
    detail: 'Day theme · roads meeting a broad coastline',
    src: './assets/costa-tijuca-day-gallery.webp',
    alt: 'Costa Tijuca map showing a large coastal city with water and road hierarchy',
    workshopUrl: workshop.costaTijuca,
    className: '',
  },
];

/** Marketing page for the Vellum desktop map viewer. */
export function App() {
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <header className="site-header page-width">
        <Brand />

        <nav className="site-nav" aria-label="Primary navigation">
          <a href="#cities">Cities</a>
          <a href="#layers">Layers</a>
          <a href="#themes">Themes</a>
          <a href="#workflow">Workflow</a>
          <a href="#open-source">Open source</a>
        </nav>

        <div className="header-actions">
          <ThemeSelector />
          <a className="button button-small button-dark" href={releaseUrl}>
            Download Vellum
            <ArrowUpRight size={15} weight="bold" aria-hidden="true" />
          </a>
        </div>
      </header>

      <main id="main-content">
        <section
          className="hero page-width"
          id="top"
          aria-labelledby="hero-title"
        >
          <Reveal className="hero-copy">
            <p className="eyebrow">
              A cartographic viewer for Cities: Skylines 1
            </p>
            <h1 id="hero-title">A map for the city you built.</h1>
            <p className="hero-lede">
              Open a <code>.cslmap</code> export and read your city in layers.
            </p>
            <div className="hero-actions">
              <a className="button button-dark" href={releaseUrl}>
                Download Vellum
                <ArrowUpRight size={17} weight="bold" aria-hidden="true" />
              </a>
              <a className="text-link" href="#layers">
                Explore the map
                <ArrowDown size={15} weight="bold" aria-hidden="true" />
              </a>
            </div>
          </Reveal>

          <Reveal className="hero-visual" delay={0.08}>
            <MapFigure
              className="map-figure-hero"
              imageClassName="map-image-hero"
              imageSrc="./assets/spring-valley-day-hero.webp"
              alt="Spring Valley map in Vellum Day theme, showing a broad city between rivers and coast"
              city="Spring Valley"
              detail="Day theme · Vellum map view"
              workshopUrl={workshop.springValley}
            />
          </Reveal>
        </section>

        <section className="promise page-width" aria-labelledby="promise-title">
          <div className="section-rule" />
          <Reveal>
            <p className="section-kicker">A record of the place</p>
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
          className="cities page-width"
          id="cities"
          aria-labelledby="cities-title"
        >
          <Reveal className="section-intro">
            <p className="section-kicker">Real maps from real cities</p>
            <h2 id="cities-title">The shape of a city is already a story.</h2>
            <p>
              These are Cities: Skylines maps opened in Vellum, with their
              original Workshop sources kept in view.
            </p>
          </Reveal>

          <div className="gallery-grid">
            {gallery.map((map, index) => (
              <Reveal
                className={`gallery-card ${map.className}`}
                delay={index * 0.06}
                key={map.city}
              >
                <MapFigure
                  imageSrc={map.src}
                  imageClassName="gallery-image"
                  alt={map.alt}
                  city={map.city}
                  detail={map.detail}
                  workshopUrl={map.workshopUrl}
                />
              </Reveal>
            ))}
          </div>
        </section>

        <section
          className="layers page-width"
          id="layers"
          aria-labelledby="layers-title"
        >
          <Reveal className="section-intro layers-intro">
            <p className="section-kicker">A map, layer by layer</p>
            <h2 id="layers-title">See the city become legible.</h2>
            <p>
              Start with terrain and base map, then bring roads, buildings,
              forests, districts, and transit into the reading.
            </p>
          </Reveal>

          <Reveal className="layer-showcase-wrap" delay={0.08}>
            <LayerShowcase />
          </Reveal>
        </section>

        <section
          className="transit-section page-width"
          aria-labelledby="transit-title"
        >
          <div className="transit-copy">
            <Reveal>
              <p className="section-kicker">Transit, brought forward</p>
              <h2 id="transit-title">Follow the network.</h2>
              <p>
                Inspect lines and stops over the city they serve, then use the
                minimap to stay oriented as you move through the view.
              </p>
            </Reveal>
            <Reveal className="transit-note" delay={0.08}>
              <span className="feature-mark" aria-hidden="true">
                <Train size={21} weight="regular" />
              </span>
              <p>When transit is the story, the map can make it the subject.</p>
            </Reveal>
          </div>

          <Reveal className="transit-visual" delay={0.12}>
            <TransitComparison />
          </Reveal>
        </section>

        <section
          className="themes page-width"
          id="themes"
          aria-labelledby="themes-title"
        >
          <Reveal className="section-intro">
            <p className="section-kicker">Built-in points of view</p>
            <h2 id="themes-title">A map can have a point of view.</h2>
            <p>
              Choose the theme that matches the way you want to remember the
              city, from a quiet overview to a transit-first reading.
            </p>
          </Reveal>

          <Reveal delay={0.08}>
            <ThemeComparison />
          </Reveal>

          <Reveal className="theme-future" delay={0.12}>
            <span className="feature-mark" aria-hidden="true">
              <Palette size={21} weight="regular" />
            </span>
            <div>
              <p className="section-kicker">Next in the atlas</p>
              <h3>Create a visual language of your own.</h3>
              <p>
                A custom <code>.vellumstyle</code> format is planned. Its schema
                is still being formalized for community-made themes.
              </p>
            </div>
          </Reveal>
        </section>

        <section
          className="workflow page-width"
          id="workflow"
          aria-labelledby="workflow-title"
        >
          <Reveal className="workflow-heading">
            <p className="section-kicker">A simple path in</p>
            <h2 id="workflow-title">From export to artifact.</h2>
            <p>
              Vellum sits after the game and before the work you want to keep.
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
                  , the community exporter.
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
                  Pan, zoom, inspect transit, control the layers, and keep your
                  bearings with the minimap.
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
          className="open-source page-width"
          id="open-source"
          aria-labelledby="open-source-title"
        >
          <Reveal className="open-source-copy">
            <p className="section-kicker">Made in the open</p>
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
            <p className="section-kicker">
              Start with the city you already have
            </p>
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
            <div>
              <Brand footer />
              <p>Maps for cities worth remembering.</p>
            </div>
            <nav className="footer-nav" aria-label="Footer navigation">
              <a href={repositoryUrl}>
                <GithubLogo size={16} weight="regular" aria-hidden="true" />
                GitHub
              </a>
              <a href={licenseUrl}>MIT License</a>
              <a href={documentationUrl}>Documentation</a>
              <a href="#top">Back to top</a>
            </nav>
          </div>
          <p className="footer-credit">
            made with <Heart size={12} weight="fill" aria-hidden="true" /> by
            Sebastian Vargas
          </p>
        </div>
      </footer>
    </div>
  );
}
