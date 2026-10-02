export const consentKey = 'vellum-analytics-consent-v1';
export const measurementId = 'G-468WQTVLLD';
export type AnalyticsChoice = 'accepted' | 'rejected';

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};
let started = false;

export function readConsent(): AnalyticsChoice | null {
  try {
    const value = localStorage.getItem(consentKey);
    return value === 'accepted' || value === 'rejected' ? value : null;
  } catch {
    return null;
  }
}

export function saveConsent(choice: AnalyticsChoice) {
  try {
    localStorage.setItem(consentKey, choice);
  } catch {
    // The choice applies to this page when browser storage is unavailable.
  }
}

export function startAnalytics() {
  if (started) return;
  started = true;
  const analyticsWindow = window as AnalyticsWindow;
  analyticsWindow.dataLayer = analyticsWindow.dataLayer ?? [];
  analyticsWindow.gtag = function () {
    analyticsWindow.dataLayer!.push(arguments);
  };
  const deniedAds = {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  };
  analyticsWindow.gtag('consent', 'default', {
    ...deniedAds,
    analytics_storage: 'denied',
  });
  analyticsWindow.gtag('consent', 'update', {
    ...deniedAds,
    analytics_storage: 'granted',
  });
  analyticsWindow.gtag('js', new Date());
  analyticsWindow.gtag('config', measurementId, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.append(script);
}

export function revokeAnalytics() {
  // Unload the tag instead of sending a denied-consent ping to Google.
  (window as unknown as Record<string, unknown>)[
    `ga-disable-${measurementId}`
  ] = true;
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0].trim();
    if (name !== '_ga' && !name.startsWith('_ga_')) continue;
    const paths = new Set([
      '/',
      ...location.pathname
        .split('/')
        .map((_, index, parts) => parts.slice(0, index + 1).join('/') || '/'),
    ]);
    const domains = location.hostname
      .split('.')
      .map((_, index, parts) => parts.slice(index).join('.'));
    for (const path of paths) {
      document.cookie = `${name}=; Max-Age=0; Path=${path}`;
      for (const domain of domains) {
        document.cookie = `${name}=; Max-Age=0; Path=${path}; Domain=${domain}`;
      }
    }
  }
  location.reload();
}
