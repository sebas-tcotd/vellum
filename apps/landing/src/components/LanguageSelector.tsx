import { useTranslation } from 'react-i18next';
import {
  fallbackLanguage,
  getSupportedLanguage,
  i18n,
  landingLanguages,
  persistLanguage,
  type LandingLanguage,
} from '../i18n';

export function LanguageSelector() {
  const { t } = useTranslation();
  const language =
    getSupportedLanguage(i18n.resolvedLanguage ?? i18n.language) ??
    fallbackLanguage;

  function chooseLanguage(nextLanguage: LandingLanguage) {
    persistLanguage(nextLanguage);
    void i18n.changeLanguage(nextLanguage);
  }

  return (
    <label className="language-selector">
      <span className="sr-only">{t('header.languageLabel')}</span>
      <select
        aria-label={t('header.languageLabel')}
        value={language}
        onChange={(event) =>
          chooseLanguage(event.target.value as LandingLanguage)
        }
      >
        {landingLanguages.map((languageOption) => (
          <option key={languageOption} value={languageOption}>
            {languageOption.toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  );
}
