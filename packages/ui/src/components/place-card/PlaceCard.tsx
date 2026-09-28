import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { X, type LucideIcon } from 'lucide-react';

/** One headline fact: a small label and its value (population, area, type…). */
export interface PlaceCardFact {
  label: string;
  value: string;
  /** Leading icon, shown by the Windows/Linux composition only. */
  icon?: LucideIcon;
}

/** One line of a rows section. A row without a label is a plain sentence. */
export interface PlaceCardRow {
  label?: string;
  value: string;
  /** Leading icon, shown by the Windows/Linux composition only. */
  icon?: LucideIcon;
}

/** One part of a segmented bar. */
export interface PlaceCardSegment {
  label: string;
  value: number;
  /** CSS color of the segment and its legend swatch. */
  color: string;
  /** Formatted value for the legend; `String(value)` when absent. */
  displayValue?: string;
}

/** A card section: either labelled rows or a segmented bar with its legend. */
export type PlaceCardSection =
  | { kind: 'rows'; heading?: string; rows: PlaceCardRow[] }
  | { kind: 'segments'; heading?: string; segments: PlaceCardSegment[] };

/** A command offered by the card (Windows/Linux composition only). */
export interface PlaceCardAction {
  id: string;
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
}

/**
 * Everything the card shows. The card knows nothing about districts or
 * buildings — each kind of place hands it this shape.
 */
export interface PlaceCardData {
  title: string;
  subtitle?: string;
  badges?: string[];
  keyFacts: PlaceCardFact[];
  sections: PlaceCardSection[];
  actions: PlaceCardAction[];
}

export interface PlaceCardProps {
  data: PlaceCardData;
  onClose: () => void;
  /**
   * Called as the card leaves the DOM, with whether focus was inside it at
   * that moment — the only point where that can still be known, so the host
   * can decide whether to hand focus back to the map.
   */
  onUnmount?: (hadFocus: boolean) => void;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * The side card that describes one place on the map.
 *
 * @remarks
 * One component tree for every platform: the macOS (Apple Maps–like) and the
 * Windows/Linux (Google Maps–like) compositions differ only in CSS keyed on
 * `[data-platform]`: macOS moves the actions to a footer row and hides the
 * leading icons; Windows/Linux keep the actions under the title. A non-modal
 * dialog: the map stays interactive
 * behind it, focus is never moved into it, and the tab order is the DOM order
 * — close, actions, then the sections that have a heading. Opening, or
 * replacing the place, is announced through a polite live region.
 */
export const PlaceCard = forwardRef<HTMLElement, PlaceCardProps>(
  function PlaceCard({ data, onClose, onUnmount, className, style }, ref) {
    const { t } = useTranslation();
    const rootRef = useRef<HTMLElement>(null);
    useImperativeHandle(ref, () => rootRef.current as HTMLElement, []);
    const onUnmountRef = useRef(onUnmount);
    onUnmountRef.current = onUnmount;
    // Layout-effect cleanups run while the removed subtree is still attached,
    // so `contains(activeElement)` is still meaningful here.
    useLayoutEffect(() => {
      const root = rootRef.current;
      return () => {
        onUnmountRef.current?.(
          root !== null && root.contains(document.activeElement),
        );
      };
    }, []);
    const titleId = useId();
    const subtitleId = useId();
    // Filled after mount, so the live region exists before its text changes —
    // a region inserted together with its content is not reliably announced.
    const [announcement, setAnnouncement] = useState('');
    useEffect(() => setAnnouncement(data.title), [data.title]);

    return (
      <section
        ref={rootRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        {...(data.subtitle ? { 'aria-describedby': subtitleId } : {})}
        className={['place-card', className].filter(Boolean).join(' ')}
        data-testid="place-card"
        {...(style ? { style } : {})}
      >
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </p>
        <header className="place-card__header">
          <button
            type="button"
            className="place-card__close"
            aria-label={t('common.close')}
            title={t('common.close')}
            onClick={onClose}
          >
            <X size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <h2 id={titleId} className="place-card__title">
            {data.title}
          </h2>
          {data.subtitle && (
            <p id={subtitleId} className="place-card__subtitle">
              {data.subtitle}
            </p>
          )}
          {data.badges && data.badges.length > 0 && (
            <ul className="place-card__badges">
              {data.badges.map((badge, i) => (
                <li key={`${i}-${badge}`} className="place-card__badge">
                  {badge}
                </li>
              ))}
            </ul>
          )}
        </header>

        {data.actions.length > 0 && (
          <div
            className="place-card__actions"
            role="group"
            aria-label={t('placeCard.actions')}
          >
            {data.actions.map(({ id, label, icon: Icon, onSelect }) => (
              <button
                key={id}
                type="button"
                className="place-card__action"
                onClick={onSelect}
              >
                {Icon && (
                  <Icon
                    className="place-card__action-icon"
                    size={16}
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                )}
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}

        {data.keyFacts.length > 0 && (
          <dl className="place-card__facts">
            {data.keyFacts.map(({ label, value, icon: Icon }, i) => (
              <div key={`${i}-${label}`} className="place-card__fact">
                {Icon && (
                  <Icon
                    className="place-card__icon"
                    size={16}
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                )}
                <dt className="place-card__fact-label">{label}</dt>
                <dd className="place-card__fact-value">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {data.sections.map((section, index) => (
          <PlaceCardSectionView key={index} section={section} />
        ))}
      </section>
    );
  },
);

function PlaceCardSectionView({ section }: { section: PlaceCardSection }) {
  const headingId = useId();
  // Only a headed section is a named, focusable stop, so a keyboard user can
  // reach and scroll it; a plain sentence is not worth a tab stop.
  const focusable = section.heading
    ? { tabIndex: 0, 'aria-labelledby': headingId }
    : {};

  return (
    <section className="place-card__section" {...focusable}>
      {section.heading && (
        <h3 id={headingId} className="place-card__section-heading">
          {section.heading}
        </h3>
      )}
      {section.kind === 'rows' ? (
        <ul className="place-card__rows">
          {section.rows.map(({ label, value, icon: Icon }, index) => (
            <li key={index} className="place-card__row">
              {Icon && (
                <Icon
                  className="place-card__icon"
                  size={16}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              )}
              {label && (
                <span className="place-card__row-label">{label}: </span>
              )}
              <span className="place-card__row-value">{value}</span>
            </li>
          ))}
        </ul>
      ) : (
        <SegmentedBar segments={section.segments} />
      )}
    </section>
  );
}

function SegmentedBar({ segments }: { segments: PlaceCardSegment[] }) {
  const total = segments.reduce(
    (sum, segment) => sum + Math.max(0, segment.value),
    0,
  );

  return (
    <>
      {/* The legend below carries the same numbers as text. */}
      <div className="place-card__bar" aria-hidden="true">
        {total > 0 &&
          segments.map((segment, i) =>
            segment.value > 0 ? (
              <span
                key={`${i}-${segment.label}`}
                className="place-card__bar-segment"
                style={{
                  flexGrow: segment.value,
                  backgroundColor: segment.color,
                }}
              />
            ) : null,
          )}
      </div>
      <ul className="place-card__legend">
        {segments.map((segment, i) => (
          <li key={`${i}-${segment.label}`} className="place-card__legend-item">
            <span
              className="place-card__swatch"
              style={{ backgroundColor: segment.color }}
              aria-hidden="true"
            />
            <span className="place-card__legend-label">{segment.label}</span>{' '}
            <span className="place-card__legend-value">
              {segment.displayValue ?? String(segment.value)}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
