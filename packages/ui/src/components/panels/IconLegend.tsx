import {
  serviceIconDataUri,
  type ServiceGroup,
  type ServiceIconLegendState,
} from '@vellum/renderer-webgl';
import { MapPinned } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { Separator } from '../../lib/separator';

/** Milliseconds an `announced` button waits, with no interaction, before collapsing to icon-only. */
const ANNOUNCE_DURATION_MS = 2000;

/**
 * Visual/interaction state of {@link IconLegend}.
 * @remarks
 * `hidden` \< `announced`/`collapsed` \< `expanded` is not a strict ladder —
 * see the state machine in `ux-design-specification.md` for every transition.
 */
type LegendState = 'hidden' | 'announced' | 'collapsed' | 'expanded';

/** Props for {@link IconLegend}. */
export interface IconLegendProps {
  /**
   * Ref populated by `MapLibreRoot` with a `subscribeServiceIconLegend`-style
   * function. Read once on mount.
   *
   * @remarks
   * **Ordering invariant:** `IconLegend` only mounts once `cityData !== null`
   * (see `App.tsx`) — by then `MapLibreRoot` has been mounted, and has run
   * its ref-registration effect, since App's initial render. If `IconLegend`
   * is ever moved to mount unconditionally (e.g. before a map loads), this
   * ref may still be `null` at read time with no retry, and the legend would
   * silently never receive updates.
   */
  subscribeRef: React.RefObject<
    ((callback: (state: ServiceIconLegendState) => void) => () => void) | null
  >;
  /**
   * Ref this component populates with a stable toggle function, so `App.tsx`
   * can wire the `L` keyboard shortcut to it — mirrors the
   * `fitToScreenRef`/`zoomInRef` imperative-ref pattern in `MapLibreRoot`.
   */
  toggleRef: React.RefObject<(() => void) | null>;
}

/**
 * Floating legend explaining the fixed-color service icons that appear over
 * civic buildings from zoom 14 onward — the esquina superior derecha mirror
 * of `FloatingLayerPanel`.
 *
 * @remarks
 * Progressive disclosure, not a persistent panel: `announced` (pill with
 * label) auto-collapses to an icon-only button after
 * {@link ANNOUNCE_DURATION_MS} of inactivity, and the whole button fades out
 * below zoom 14. Every upward crossing of the zoom threshold restarts the
 * `announced → collapsed` cycle — this is a contextual affordance ("there are
 * icons to explain right now"), not a one-time onboarding hint, so it does
 * not persist dismissal in `localStorage`.
 */
export function IconLegend({ subscribeRef, toggleRef }: IconLegendProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<LegendState>('hidden');
  const [visibleGroups, setVisibleGroups] = useState<ServiceGroup[]>([]);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Subscribe to zoom/viewport-driven relevance. Forced-collapse rule: an
  // `expanded` panel steps down to `collapsed` first when zoom drops below
  // 14, and only fully hides on the *next* below-threshold event — this
  // avoids yanking focus out from under the user in one jump.
  useEffect(() => {
    const subscribe = subscribeRef.current;
    if (!subscribe) return;
    return subscribe(({ visible, groups }) => {
      setVisibleGroups(groups);
      setState((prev) => {
        if (!visible) return prev === 'expanded' ? 'collapsed' : 'hidden';
        if (prev === 'hidden') return 'announced';
        return prev;
      });
    });
  }, [subscribeRef]);

  // Auto-collapse the announced pill after ANNOUNCE_DURATION_MS of inactivity.
  useEffect(() => {
    if (state !== 'announced') return;
    const timer = setTimeout(() => setState('collapsed'), ANNOUNCE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const expand = () => setState('expanded');
  const collapse = () => {
    setState('collapsed');
    requestAnimationFrame(() => buttonRef.current?.focus());
  };
  const toggle = () => {
    if (state === 'hidden') return; // nothing to toggle below the zoom threshold
    setState(state === 'expanded' ? 'collapsed' : 'expanded');
    if (state === 'expanded') {
      requestAnimationFrame(() => buttonRef.current?.focus());
    }
  };

  // Expose the toggle to App.tsx for the `L` keyboard shortcut.
  useEffect(() => {
    toggleRef.current = toggle;
    return () => {
      if (toggleRef.current === toggle) toggleRef.current = null;
    };
  }, [toggleRef, toggle]);

  // Escape closes the expanded panel and returns focus to the toggle button.
  useEffect(() => {
    if (state !== 'expanded') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') collapse();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state]);

  if (state === 'hidden') return null;

  const isExpanded = state === 'expanded';
  const isAnnounced = state === 'announced';

  return (
    <div className="fixed top-4 right-4 z-[70] flex flex-col items-end gap-2">
      <button
        ref={buttonRef}
        type="button"
        onClick={isExpanded ? collapse : expand}
        aria-label={t('a11y.iconLegendToggle')}
        aria-expanded={isExpanded}
        className={cn(
          'backdrop-blur-lg bg-background/72 border border-panel-border text-accent-foreground shadow-lg',
          'flex items-center gap-2 font-ui text-sm cursor-pointer transition-[width,padding] duration-200',
          isAnnounced
            ? 'rounded-full px-3 py-2'
            : 'rounded-full w-9 h-9 justify-center p-0',
        )}
      >
        {isAnnounced && <span>{t('iconLegend.buttonLabel')}</span>}
        <MapPinned size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>

      {isExpanded && (
        <div
          role="region"
          aria-label={t('a11y.iconLegend')}
          className="backdrop-blur-lg rounded-lg bg-background/72 border border-panel-border text-accent-foreground shadow-lg px-3 py-2 min-w-52 w-fit"
        >
          <h2 className="font-wordmark text-sm font-medium opacity-90">
            {t('iconLegend.title')}
          </h2>

          <Separator className="h-px my-2 w-full" />

          {visibleGroups.length === 0 ? (
            <p className="font-ui text-xs opacity-70 py-1">
              {t('iconLegend.empty')}
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {visibleGroups.map((group) => (
                <li
                  key={group}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="font-ui text-xs opacity-90">
                    {t(`serviceGroups.${group}`)}
                  </span>
                  <img
                    src={serviceIconDataUri(group)}
                    alt=""
                    aria-hidden="true"
                    width={18}
                    height={18}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
