import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  consentKey,
  readConsent,
  revokeAnalytics,
  saveConsent,
  startAnalytics,
  type AnalyticsChoice,
} from '../analytics';

export function AnalyticsConsent({ privacyPage }: { privacyPage: boolean }) {
  const { t } = useTranslation();
  const [choice, setChoice] = useState(readConsent);
  const [open, setOpen] = useState(() => readConsent() === null);
  const settings = useRef<HTMLButtonElement>(null);
  const reject = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (choice === 'accepted' && !privacyPage) startAnalytics();
  }, [choice, privacyPage]);

  useEffect(() => {
    const syncChoice = (event: StorageEvent) => {
      if (event.key === consentKey || event.key === null) {
        const next = readConsent();
        if (choice === 'accepted' && next !== 'accepted') revokeAnalytics();
        else {
          setChoice(next);
          setOpen(next === null);
        }
      }
    };
    window.addEventListener('storage', syncChoice);
    return () => window.removeEventListener('storage', syncChoice);
  }, [choice]);

  function choose(next: AnalyticsChoice) {
    saveConsent(next);
    setChoice(next);
    setOpen(false);
    settings.current?.focus();
    if (next === 'rejected') revokeAnalytics();
  }

  return (
    <>
      <button
        className="analytics-settings"
        ref={settings}
        aria-expanded={open}
        aria-controls="analytics-consent"
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => reject.current?.focus());
        }}
      >
        {t('consent.settings')}
      </button>
      {open && (
        <section
          id="analytics-consent"
          className="analytics-consent"
          aria-labelledby="analytics-consent-title"
        >
          <h2 id="analytics-consent-title">{t('consent.title')}</h2>
          <p>{t('consent.body')}</p>
          <a
            href={`${privacyPage ? './' : './privacy/'}?lang=${t('consent.language')}`}
          >
            {t('consent.policy')}
          </a>
          <div className="analytics-consent-actions">
            <button ref={reject} onClick={() => choose('rejected')}>
              {t('consent.reject')}
            </button>
            <button onClick={() => choose('accepted')}>
              {t('consent.accept')}
            </button>
            {choice && (
              <button
                onClick={() => {
                  setOpen(false);
                  settings.current?.focus();
                }}
              >
                {t('consent.close')}
              </button>
            )}
          </div>
        </section>
      )}
    </>
  );
}
