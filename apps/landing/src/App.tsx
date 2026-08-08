const releaseUrl = 'https://github.com/sebas-tcotd/vellum/releases/latest';
const repositoryUrl = 'https://github.com/sebas-tcotd/vellum';

const benefits = [
  {
    number: '01',
    title: 'Cartografía con intención',
    description:
      'Terreno, agua, calles y edificios con una jerarquía visual pensada para leer la ciudad.',
  },
  {
    number: '02',
    title: 'Tus redes, sobre el mapa real',
    description:
      'Explora líneas de bus, metro, tren y tranvía siguiendo la geometría de tu ciudad.',
  },
  {
    number: '03',
    title: 'Hecho para conservar',
    description:
      'Exporta vistas PNG y mapas SVG editables para documentar cada etapa de tu ciudad.',
  },
];

/**
 * Product landing page shell for Vellum.
 */
export function App() {
  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Vellum, inicio">
          <span className="brand-mark" aria-hidden="true">
            V
          </span>
          <span>Vellum</span>
        </a>
        <nav className="site-nav" aria-label="Navegación principal">
          <a href="#features">Qué hace</a>
          <a href="#workflow">Cómo funciona</a>
          <a href={repositoryUrl}>GitHub</a>
        </nav>
        <a className="header-cta" href={releaseUrl}>
          Descargar
        </a>
      </header>

      <main id="top">
        <section className="hero section-frame">
          <div className="hero-copy">
            <p className="eyebrow">Cartografía para Cities: Skylines</p>
            <h1>
              Tu ciudad,
              <em> convertida en mapa.</em>
            </h1>
            <p className="hero-lede">
              Vellum transforma tus archivos <code>.cslmap</code> en mapas
              cartográficos limpios, explorables y dignos de conservar.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href={releaseUrl}>
                Descargar Vellum <span aria-hidden="true">↗</span>
              </a>
              <a className="text-link" href="#workflow">
                Ver cómo funciona <span aria-hidden="true">↓</span>
              </a>
            </div>
            <p className="hero-note">Gratis y open source · MIT License</p>
          </div>

          <div
            className="hero-map"
            aria-label="Vista previa de un mapa cartográfico de Vellum"
          >
            <div className="map-toolbar">
              <span>MAP / AURELIA DELTA</span>
              <span>01 — 04</span>
            </div>
            <div className="map-grid" aria-hidden="true">
              <span className="map-water water-one" />
              <span className="map-water water-two" />
              <span className="map-road road-one" />
              <span className="map-road road-two" />
              <span className="map-road road-three" />
              <span className="map-transit transit-one" />
              <span className="map-transit transit-two" />
              <span className="map-district district-one" />
              <span className="map-district district-two" />
              <span className="map-district district-three" />
            </div>
            <div className="map-caption">
              <span>Elevation / transit / districts</span>
              <span>VELLUM 0.1</span>
            </div>
          </div>
        </section>

        <section className="manifesto section-frame">
          <p className="section-kicker">El momento de reconocimiento</p>
          <h2>
            Después de cientos de horas construyendo,
            <span> por fin puedes verla como un mapa.</span>
          </h2>
        </section>

        <section className="benefits section-frame" id="features">
          <div className="section-heading">
            <p className="section-kicker">Diseñado para mirar más de cerca</p>
            <h2>Todo lo que hace que tu ciudad sea tuya.</h2>
          </div>
          <div className="benefit-grid">
            {benefits.map((benefit) => (
              <article className="benefit-card" key={benefit.number}>
                <span className="benefit-number">{benefit.number}</span>
                <h3>{benefit.title}</h3>
                <p>{benefit.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="workflow section-frame" id="workflow">
          <div className="workflow-copy">
            <p className="section-kicker">Un flujo sencillo</p>
            <h2>Del archivo a la pieza cartográfica.</h2>
            <p>
              Abre una exportación de tu ciudad, explora sus capas y decide cómo
              quieres recordarla. Sin wizards, sin configuración pesada.
            </p>
            <a className="text-link" href={releaseUrl}>
              Empieza con tu ciudad <span aria-hidden="true">↗</span>
            </a>
          </div>
          <ol className="workflow-list">
            <li>
              <span>01</span>
              <strong>Exporta</strong>
              <p>Obtén un archivo .cslmap desde Cities: Skylines.</p>
            </li>
            <li>
              <span>02</span>
              <strong>Explora</strong>
              <p>Activa capas, inspecciona el tránsito y encuentra detalles.</p>
            </li>
            <li>
              <span>03</span>
              <strong>Conserva</strong>
              <p>Exporta una vista PNG o un mapa SVG editable.</p>
            </li>
          </ol>
        </section>

        <section className="download section-frame">
          <div>
            <p className="section-kicker">
              La primera versión está tomando forma
            </p>
            <h2>Trae tu ciudad.</h2>
          </div>
          <div className="download-action">
            <p>Descarga la última versión desde GitHub Releases.</p>
            <a className="button button-light" href={releaseUrl}>
              Ver releases <span aria-hidden="true">↗</span>
            </a>
          </div>
        </section>
      </main>

      <footer className="site-footer section-frame">
        <a className="brand" href="#top">
          <span className="brand-mark" aria-hidden="true">
            V
          </span>
          <span>Vellum</span>
        </a>
        <span>Una ciudad también puede ser un documento.</span>
        <a href={repositoryUrl}>GitHub ↗</a>
      </footer>
    </div>
  );
}
