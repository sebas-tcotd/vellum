import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from './components/LanguageSelector';
import { ThemeSelector } from './components/ThemeSelector';
import { fallbackLanguage, i18n } from './i18n';

export function Privacy() {
  const { t } = useTranslation();
  const home = `../?lang=${i18n.resolvedLanguage ?? fallbackLanguage}`;

  useEffect(() => {
    document.documentElement.lang = i18n.resolvedLanguage ?? fallbackLanguage;
    document.title = t('privacy.metaTitle');
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', t('privacy.metaDescription'));
    document
      .querySelector('meta[property="og:title"]')
      ?.setAttribute('content', t('privacy.metaTitle'));
    document
      .querySelector('meta[property="og:description"]')
      ?.setAttribute('content', t('privacy.metaDescription'));
  }, [i18n.language, t]);

  return (
    <div className="site-shell privacy-shell">
      <a className="skip-link" href="#main-content">
        {t('common.skipToContent')}
      </a>
      <header className="site-header page-width">
        <a className="brand" href={home} aria-label={t('common.homeLabel')}>
          <img
            className="brand-isotype"
            src="../assets/vellum-isotype-rounded.svg"
            alt=""
            aria-hidden="true"
          />
          <span className="brand-name">Vellum</span>
        </a>
        <nav
          className="header-actions"
          aria-label={t('header.primaryNavigation')}
        >
          <a href={home}>{t('privacy.home')}</a>
          <LanguageSelector />
          <ThemeSelector />
        </nav>
      </header>
      <main id="main-content" className="privacy-content page-width">
        <p className="eyebrow">Vellum City Maps</p>
        <h1>{t('privacy.title')}</h1>
        <p className="privacy-lede">{t('privacy.intro')}</p>
        {(
          [
            'desktop',
            'store',
            'standalone',
            'files',
            'website',
            'preferences',
            'contact',
          ] as const
        ).map((section) => (
          <section key={section} aria-labelledby={`privacy-${section}`}>
            <h2 id={`privacy-${section}`}>{t(`privacy.${section}.title`)}</h2>
            <p>{t(`privacy.${section}.body`)}</p>
            {section === 'website' && (
              <a href="https://policies.google.com/privacy">
                {t('privacy.googlePrivacy')}
              </a>
            )}
            {(section === 'standalone' || section === 'contact') && (
              <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">
                {t('privacy.githubPrivacy')}
              </a>
            )}
            {section === 'contact' && (
              <a href="https://github.com/sebas-tcotd/vellum/issues">GitHub</a>
            )}
          </section>
        ))}
      </main>
      <footer className="site-footer">
        <div className="site-footer-inner page-width">
          <a href={home}>{t('privacy.home')}</a>
        </div>
      </footer>
    </div>
  );
}
