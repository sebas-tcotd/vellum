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
import { LanguageSelector } from './components/LanguageSelector';
import { Reveal } from './components/Reveal';
import { ThemeSelector } from './components/ThemeSelector';
import { ThemeComparison } from './components/ThemeComparison';
import { TransitComparison } from './components/TransitComparison';
import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import { fallbackLanguage, i18n } from './i18n';

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
  const { t } = useTranslation();

  return (
    <a className="workshop-link" href={href} target="_blank" rel="noreferrer">
      {t('common.workshop')}
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
  const { t } = useTranslation();

  return (
    <a className="brand" href="#top" aria-label={t('common.homeLabel')}>
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
    key: 'islandHopping',
    src: './assets/island-hopping-day-gallery.webp',
    workshopUrl: workshop.islandHopping,
    className: 'gallery-card-wide',
  },
  {
    key: 'westdale',
    src: './assets/westdale-day-gallery.webp',
    workshopUrl: workshop.atlanticKeys,
    className: 'gallery-card-tall',
  },
  {
    key: 'sanRico',
    src: './assets/san-rico-day-gallery.webp',
    workshopUrl: workshop.sanRico,
    className: '',
  },
  {
    key: 'costaTijuca',
    src: './assets/costa-tijuca-day-gallery.webp',
    workshopUrl: workshop.costaTijuca,
    className: '',
  },
];

function SiteHeader() {
  const { t } = useTranslation();

  return (
    <header className="site-header page-width">
      <Brand />
      <nav className="site-nav" aria-label={t('header.primaryNavigation')}>
        <a href="#cities">{t('header.nav.cities')}</a>
        <a href="#layers">{t('header.nav.layers')}</a>
        <a href="#themes">{t('header.nav.themes')}</a>
        <a href="#workflow">{t('header.nav.workflow')}</a>
        <a href="#open-source">{t('header.nav.openSource')}</a>
      </nav>
      <div className="header-actions">
        <LanguageSelector />
        <ThemeSelector />
        <a className="button button-small button-dark" href={releaseUrl}>
          {t('common.download')}
          <ArrowUpRight size={15} weight="bold" aria-hidden="true" />
        </a>
      </div>
    </header>
  );
}

function SiteFooter() {
  const { t } = useTranslation();

  return (
    <footer className="site-footer">
      <div className="site-footer-inner page-width">
        <div className="footer-main">
          <div>
            <Brand footer />
            <p>{t('footer.tagline')}</p>
          </div>
          <nav className="footer-nav" aria-label={t('footer.navigation')}>
            <a href={repositoryUrl}>
              <GithubLogo size={16} weight="regular" aria-hidden="true" />
              GitHub
            </a>
            <a href={licenseUrl}>{t('footer.mit')}</a>
            <a href={documentationUrl}>{t('openSource.documentation')}</a>
            <a href="#top">{t('common.backToTop')}</a>
          </nav>
        </div>
        <p className="footer-credit">
          {t('footer.credit')}{' '}
          <Heart size={12} weight="fill" aria-hidden="true" /> {t('footer.by')}{' '}
          Sebastian Vargas
        </p>
      </div>
    </footer>
  );
}

/** Marketing page for the Vellum desktop map viewer. */
export function App() {
  const { t } = useTranslation();

  useEffect(() => {
    const language = i18n.resolvedLanguage ?? fallbackLanguage;
    document.documentElement.lang = language;
    document.title = t('meta.title');
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', t('meta.description'));
    document
      .querySelector('meta[property="og:title"]')
      ?.setAttribute('content', t('meta.title'));
    document
      .querySelector('meta[property="og:description"]')
      ?.setAttribute('content', t('meta.ogDescription'));
  }, [i18n.language, t]);

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        {t('common.skipToContent')}
      </a>

      <SiteHeader />

      <main id="main-content">
        <section
          className="hero page-width"
          id="top"
          aria-labelledby="hero-title"
        >
          <Reveal className="hero-copy">
            <p className="eyebrow">{t('hero.eyebrow')}</p>
            <h1 id="hero-title">{t('hero.title')}</h1>
            <p className="hero-lede">
              {t('hero.ledeBefore')} <code>.cslmap</code> {t('hero.ledeAfter')}
            </p>
            <div className="hero-actions">
              <a className="button button-dark" href={releaseUrl}>
                {t('common.download')}
                <ArrowUpRight size={17} weight="bold" aria-hidden="true" />
              </a>
              <a className="text-link" href="#layers">
                {t('hero.explore')}
                <ArrowDown size={15} weight="bold" aria-hidden="true" />
              </a>
            </div>
            <p className="hero-status">
              <strong>{t('hero.statusLabel')}</strong> {t('hero.statusBody')}{' '}
              <a href={`${repositoryUrl}/issues`}>{t('hero.statusLink')}</a>
            </p>
          </Reveal>

          <Reveal className="hero-visual" delay={0.08}>
            <MapFigure
              className="map-figure-hero"
              imageClassName="map-image-hero"
              imageSrc="./assets/spring-valley-day-hero.webp"
              alt={t('hero.imageAlt')}
              city="Spring Valley"
              detail={t('hero.imageDetail')}
              workshopUrl={workshop.springValley}
            />
          </Reveal>
        </section>

        <section className="promise page-width" aria-labelledby="promise-title">
          <div className="section-rule" />
          <Reveal>
            <p className="section-kicker">{t('promise.kicker')}</p>
            <h2 id="promise-title">{t('promise.title')}</h2>
            <p>{t('promise.body')}</p>
          </Reveal>
        </section>

        <section
          className="cities page-width"
          id="cities"
          aria-labelledby="cities-title"
        >
          <Reveal className="section-intro">
            <p className="section-kicker">{t('cities.kicker')}</p>
            <h2 id="cities-title">{t('cities.title')}</h2>
            <p>{t('cities.body')}</p>
          </Reveal>

          <div className="gallery-grid">
            {gallery.map((map, index) => (
              <Reveal
                className={`gallery-card ${map.className}`}
                delay={index * 0.06}
                key={map.key}
              >
                <MapFigure
                  imageSrc={map.src}
                  imageClassName="gallery-image"
                  alt={t(`gallery.${map.key}.alt`)}
                  city={t(`gallery.${map.key}.city`)}
                  detail={t(`gallery.${map.key}.detail`)}
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
            <p className="section-kicker">{t('layers.kicker')}</p>
            <h2 id="layers-title">{t('layers.title')}</h2>
            <p>{t('layers.body')}</p>
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
              <p className="section-kicker">{t('transit.kicker')}</p>
              <h2 id="transit-title">{t('transit.title')}</h2>
              <p>{t('transit.body')}</p>
            </Reveal>
            <Reveal className="transit-note" delay={0.08}>
              <span className="feature-mark" aria-hidden="true">
                <Train size={21} weight="regular" />
              </span>
              <p>{t('transit.note')}</p>
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
            <p className="section-kicker">{t('themes.kicker')}</p>
            <h2 id="themes-title">{t('themes.title')}</h2>
            <p>{t('themes.body')}</p>
          </Reveal>

          <Reveal delay={0.08}>
            <ThemeComparison />
          </Reveal>

          <Reveal className="theme-future" delay={0.12}>
            <span className="feature-mark" aria-hidden="true">
              <Palette size={21} weight="regular" />
            </span>
            <div>
              <p className="section-kicker">{t('themes.futureKicker')}</p>
              <h3>{t('themes.futureTitle')}</h3>
              <p>{t('themes.futureBody')}</p>
            </div>
          </Reveal>
        </section>

        <section
          className="workflow page-width"
          id="workflow"
          aria-labelledby="workflow-title"
        >
          <Reveal className="workflow-heading">
            <p className="section-kicker">{t('workflow.kicker')}</p>
            <h2 id="workflow-title">{t('workflow.title')}</h2>
            <p>{t('workflow.body')}</p>
          </Reveal>

          <ol className="workflow-list">
            <Reveal as="li" className="workflow-item">
              <span className="workflow-icon" aria-hidden="true">
                <ArrowUpRight size={20} weight="regular" />
              </span>
              <div>
                <h3>{t('workflow.getTitle')}</h3>
                <p>
                  {t('workflow.getBodyBefore')}{' '}
                  <a href={cslMapViewUrl}>{t('workflow.cslMapView')}</a>
                  {t('workflow.getBodyAfter')}
                </p>
              </div>
            </Reveal>
            <Reveal as="li" className="workflow-item" delay={0.08}>
              <span className="workflow-icon" aria-hidden="true">
                <MapTrifold size={20} weight="regular" />
              </span>
              <div>
                <h3>{t('workflow.openTitle')}</h3>
                <p>{t('workflow.openBody')}</p>
              </div>
            </Reveal>
            <Reveal as="li" className="workflow-item" delay={0.16}>
              <span className="workflow-icon" aria-hidden="true">
                <Export size={20} weight="regular" />
              </span>
              <div>
                <h3>{t('workflow.exportTitle')}</h3>
                <p>{t('workflow.exportBody')}</p>
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
            <p className="section-kicker">{t('openSource.kicker')}</p>
            <h2 id="open-source-title">{t('openSource.title')}</h2>
            <p>{t('openSource.body')}</p>
          </Reveal>
          <Reveal className="open-source-links" delay={0.08}>
            <a className="text-link" href={repositoryUrl}>
              <GithubLogo size={17} weight="regular" aria-hidden="true" />
              {t('openSource.repository')}
              <ArrowUpRight size={15} weight="bold" aria-hidden="true" />
            </a>
            <a className="text-link" href={documentationUrl}>
              {t('openSource.documentation')}
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
            <p className="section-kicker">{t('download.kicker')}</p>
            <h2 id="download-title">{t('download.title')}</h2>
            <p>{t('download.body')}</p>
          </Reveal>
          <Reveal delay={0.08}>
            <a className="button button-light" href={releaseUrl}>
              {t('common.download')}
              <ArrowUpRight size={17} weight="bold" aria-hidden="true" />
            </a>
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
