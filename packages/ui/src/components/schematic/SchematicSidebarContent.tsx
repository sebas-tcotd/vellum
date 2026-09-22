import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { TransitMode } from '@vellum/core';
import { Switch } from '../../lib/switch';
import type {
  SchematicLegendLine,
  SchematicNetworkModel,
} from '../../hooks/use-schematic-network';
import {
  PUBLISHED_SCHEMATIC_LAYOUT_IDS,
  type SchematicLayoutId,
} from '../../shell/shell-session';

export interface SchematicSidebarContentProps {
  model: SchematicNetworkModel;
  /** Switches one transport mode on or off. */
  onToggleMode: (mode: TransitMode) => void;
  /** Brings every switched-off mode back. */
  onShowAllModes: () => void;
  /** Reports the line the pointer is over, or `null` on the way out. */
  onHoverLine?: (lineId: string | null) => void;
  /** Geometry the diagram is drawn with (Story 4.3). */
  layoutId?: SchematicLayoutId;
  /** Asks for a different geometry. Absent means the selector is not offered. */
  onSetLayout?: (layoutId: SchematicLayoutId) => void;
  layoutIds?: readonly SchematicLayoutId[] | undefined;
  /**
   * Re-routes the geometry for the lines currently on screen, or hands `null`
   * back to lay the whole network out again. Absent means the control is not
   * offered.
   */
  onRelayout?: (lineIds: readonly string[] | null) => void;
}

/**
 * The schematic view's sidebar body: what the diagram is drawing, and the only
 * controls that change it.
 *
 * @remarks
 * Explanation and control sit beside the network rather than over it, so no
 * stroke is ever covered by the thing describing it. Everything shown is
 * derived from geometry that is actually drawn — a line the city knows about
 * but never draws earns no row, no counter and no switch, because a control
 * for something invisible cannot be understood or undone.
 *
 * Line rows are informative: they carry no filter of their own and stay out of
 * the tab order, which keeps the schematic's controls to the handful of mode
 * switches the user can actually reason about.
 */
const noop = (): void => {};

export function SchematicSidebarContent({
  model,
  onToggleMode,
  onShowAllModes,
  onHoverLine = noop,
  layoutId = 'geographic',
  onSetLayout,
  layoutIds = PUBLISHED_SCHEMATIC_LAYOUT_IDS,
  onRelayout,
}: SchematicSidebarContentProps) {
  const { t } = useTranslation();
  const {
    availableModes,
    hiddenModes,
    legend,
    visibleLineCount,
    hasDrawableNetwork,
    hasVisibleStations,
    isFilteredEmpty,
    relayoutLineIds,
  } = model;
  const canRestore = hiddenModes.size > 0;
  const visibleLineIds = legend.flatMap((group) =>
    group.lines.map((line) => line.lineId),
  );

  return (
    <div className="schematic-panel" data-testid="schematic-sidebar">
      <h2 className="schematic-panel__title">{t('schematicSidebar.title')}</h2>

      {hasDrawableNetwork ? (
        <p
          className="schematic-panel__summary"
          data-testid="schematic-visible-count"
          // The count is the one thing that changes on every toggle, so it is
          // the only live region here: announcing the whole list would read
          // the network out again each time a switch is flipped.
          aria-live="polite"
        >
          {t('schematicSidebar.visibleLines', { count: visibleLineCount })}
        </p>
      ) : (
        // No routes at all: no switches and no "restore", which would promise
        // a recovery that does not exist.
        <p className="schematic-panel__empty" data-testid="schematic-no-routes">
          {t('schematicSidebar.noRoutes')}
        </p>
      )}

      {onSetLayout !== undefined && hasDrawableNetwork && (
        <LayoutRadioGroup
          layoutId={layoutId}
          layoutIds={layoutIds}
          onSetLayout={onSetLayout}
          label={t('schematicSidebar.layout')}
        />
      )}

      {availableModes.length > 0 && (
        <section
          className="schematic-panel__section"
          aria-label={t('schematicSidebar.modes')}
        >
          <h3 className="schematic-panel__heading">
            {t('schematicSidebar.modes')}
          </h3>
          {availableModes.map((mode) => {
            const label = t(`transitModes.${mode}`);
            return (
              <div className="schematic-panel__switch-row" key={mode}>
                <span className="schematic-panel__switch-label">{label}</span>
                <Switch
                  className="shrink-0"
                  aria-label={label}
                  data-testid={`schematic-mode-${mode}`}
                  checked={!hiddenModes.has(mode)}
                  onCheckedChange={() => onToggleMode(mode)}
                />
              </div>
            );
          })}
          {canRestore && (
            <button
              type="button"
              className="schematic-panel__restore"
              data-testid="schematic-show-all-modes"
              onClick={onShowAllModes}
            >
              {t('schematicSidebar.showAllModes')}
            </button>
          )}
          {/* Two operations, deliberately not one control. A mode switch
              *projects*: every line that stays keeps the position it had, which
              is what lets two selections be compared. This re-routes for the
              smaller network, which moves everything — so it is asked for, not
              implied, and any later switch hands the full layout back. */}
          {onRelayout !== undefined &&
            (relayoutLineIds !== null || canRestore) && (
              <button
                type="button"
                className="schematic-panel__restore"
                data-testid="schematic-relayout"
                title={
                  relayoutLineIds === null
                    ? t('schematicSidebar.refitLayoutHint')
                    : undefined
                }
                disabled={
                  relayoutLineIds === null && visibleLineIds.length === 0
                }
                onClick={() =>
                  onRelayout(relayoutLineIds === null ? visibleLineIds : null)
                }
              >
                {relayoutLineIds === null
                  ? t('schematicSidebar.refitLayout')
                  : t('schematicSidebar.restoreLayout')}
              </button>
            )}
        </section>
      )}

      {isFilteredEmpty && (
        <p
          className="schematic-panel__empty"
          data-testid="schematic-sidebar-filtered"
        >
          {t('schematicSidebar.filteredEmpty')}
        </p>
      )}

      {legend.length > 0 && (
        <section
          className="schematic-panel__section"
          aria-label={t('schematicSidebar.legend')}
        >
          <h3 className="schematic-panel__heading">
            {t('schematicSidebar.legend')}
          </h3>
          {legend.map((group) => (
            <div className="schematic-panel__group" key={group.mode}>
              <h4 className="schematic-panel__group-title">
                {modeLabel(group.mode, t)}
              </h4>
              <ul className="schematic-panel__lines">
                {group.lines.map((line) => (
                  <LegendRow
                    key={line.lineId}
                    line={line}
                    fallback={t('schematicSidebar.unnamedLine')}
                    onHover={onHoverLine}
                  />
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {hasVisibleStations && (
        <section
          className="schematic-panel__section"
          aria-label={t('schematicSidebar.key')}
        >
          <h3 className="schematic-panel__heading">
            {t('schematicSidebar.key')}
          </h3>
          <ul className="schematic-panel__lines">
            <li className="schematic-panel__row">
              <span
                className="schematic-panel__stop-swatch"
                aria-hidden="true"
              />
              <span className="schematic-panel__row-label">
                {t('schematicSidebar.stop')}
              </span>
            </li>
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * The geometry selector: three mutually exclusive layouts.
 *
 * @remarks
 * A radiogroup, not three switches, because exactly one geometry is ever drawn
 * — the diagram is a single `<svg>` fed by a single model, so "both at once" is
 * not a state the surface can even express. `packages/ui/src/lib` has no
 * radiogroup primitive, so this is the native ARIA pattern: one tab stop for
 * the group, roving `tabIndex`, and arrow keys to move the selection, which is
 * what a radiogroup is expected to do.
 *
 * The two grid layouts carry a visible `experimental` mark, in words rather
 * than by colour alone. It is not decoration: Story 4.3's gates decide what is
 * publishable, and until 4.4 publishes one, choosing these is choosing a spike.
 *
 * The group is named once. An `aria-label` on the `<section>`, a visible `<h3>`
 * and an `aria-label` on the radiogroup would all carry the same words, so a
 * screen reader would announce "Diagram geometry" three times before reaching
 * the first option; instead the heading is the single name and the radiogroup
 * points at it with `aria-labelledby`.
 */
function LayoutRadioGroup({
  layoutId,
  onSetLayout,
  label,
  layoutIds,
}: {
  layoutId: SchematicLayoutId;
  onSetLayout: (layoutId: SchematicLayoutId) => void;
  label: string;
  layoutIds: readonly SchematicLayoutId[];
}) {
  const { t } = useTranslation();
  const groupRef = useRef<HTMLDivElement>(null);
  const headingId = 'schematic-layout-heading';

  const focusOption = (next: SchematicLayoutId): void => {
    // The moved-to option has to take focus with the selection, or the reader
    // is told about a choice the keyboard no longer points at.
    groupRef.current
      ?.querySelector<HTMLButtonElement>(`[data-layout-id="${next}"]`)
      ?.focus();
  };

  const select = (next: SchematicLayoutId): void => {
    onSetLayout(next);
    focusOption(next);
  };

  const move = (delta: number): void => {
    const count = layoutIds.length;
    // `indexOf` answers -1 for an id outside the list. Left alone, `-1 + delta`
    // wraps to an arbitrary option and the arrows would jump somewhere the user
    // cannot predict; clamping to the first option makes an unknown id behave
    // like "nothing chosen yet".
    const found = layoutIds.indexOf(layoutId);
    const index = found >= 0 ? found : 0;
    select(layoutIds[(index + delta + count) % count]);
  };

  return (
    <section
      className="schematic-panel__section"
      data-testid="schematic-layout-section"
    >
      <h3 className="schematic-panel__heading" id={headingId}>
        {label}
      </h3>
      <div
        ref={groupRef}
        role="radiogroup"
        aria-labelledby={headingId}
        className="schematic-panel__layouts"
      >
        {layoutIds.map((id) => {
          const selected = id === layoutId;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              // Roving tab index: the group is one stop, the arrows do the rest.
              tabIndex={selected ? 0 : -1}
              data-layout-id={id}
              data-testid={`schematic-layout-${id}`}
              className="schematic-panel__layout"
              onClick={() => onSetLayout(id)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                  event.preventDefault();
                  move(1);
                } else if (
                  event.key === 'ArrowUp' ||
                  event.key === 'ArrowLeft'
                ) {
                  event.preventDefault();
                  move(-1);
                } else if (event.key === 'Home') {
                  // Part of the radiogroup contract, not a nicety: a keyboard
                  // user who wants the published geometry back should not have
                  // to count arrow presses.
                  event.preventDefault();
                  select(layoutIds[0]);
                } else if (event.key === 'End') {
                  event.preventDefault();
                  select(layoutIds[layoutIds.length - 1]);
                }
              }}
            >
              <span
                className="schematic-panel__layout-mark"
                aria-hidden="true"
              />
              <span className="schematic-panel__layout-label">
                {t(`schematicLayouts.${id}`)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * `Unknown` is the DLC fallback and has no global label — `transitModes.Unknown`
 * is deliberately blank in every locale. Here it still has to be named, because
 * its lines *are* drawn and always visible, so the schematic gives it a label
 * of its own instead of showing an unnamed group.
 */
function modeLabel(
  mode: TransitMode,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  return mode === 'Unknown'
    ? t('schematicSidebar.unknownMode')
    : t(`transitModes.${mode}`);
}

function LegendRow({
  line,
  fallback,
  onHover,
}: {
  line: SchematicLegendLine;
  fallback: string;
  onHover: (lineId: string | null) => void;
}) {
  // The colour never carries meaning on its own: the name and the mode group
  // it sits under say the same thing in words.
  //
  // Hover is an aid, not a way through: the row carries no filter, so pointing
  // at it only holds the other strokes back. Nothing here is keyboard-only
  // content, which is why the row still stays out of the tab order.
  return (
    <li
      className="schematic-panel__row schematic-panel__row--line"
      data-line-id={line.lineId}
      onPointerEnter={() => onHover(line.lineId)}
      onPointerLeave={() => onHover(null)}
    >
      <span
        className="schematic-panel__line-swatch"
        style={{ background: line.color }}
        aria-hidden="true"
      />
      <span className="schematic-panel__row-label">
        {line.name ?? fallback}
      </span>
    </li>
  );
}
