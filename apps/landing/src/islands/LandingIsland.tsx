import { StrictMode, useEffect, useState, type ReactNode } from 'react';
import { AnalyticsConsent } from '../components/AnalyticsConsent';
import { i18n, i18nReady } from '../i18n';

/** Props for the client-only root that hosts a legacy landing page. */
interface LandingIslandProps {
  children: ReactNode;
  privacyPage: boolean;
}

/**
 * Renders a legacy landing page and the consent bar once i18n is ready.
 *
 * @remarks
 * The page renders on the client, so the browser has already tried the URL
 * hash before `#download` exists. After the first paint the island scrolls to
 * the hash target itself, which keeps `/vellum/#download` landing on the band.
 */
export function LandingIsland({ children, privacyPage }: LandingIslandProps) {
  const [ready, setReady] = useState(i18n.isInitialized);

  useEffect(() => {
    if (ready) return;
    let active = true;
    void i18nReady.then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, [ready]);

  useEffect(() => {
    if (!ready || window.location.hash.length < 2) return;
    let id: string;
    try {
      id = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      // A malformed hash (e.g. `#%E0`) has no target; keep the page as is.
      return;
    }
    document.getElementById(id)?.scrollIntoView();
  }, [ready]);

  if (!ready) return null;

  return (
    <StrictMode>
      {children}
      <AnalyticsConsent privacyPage={privacyPage} />
    </StrictMode>
  );
}
