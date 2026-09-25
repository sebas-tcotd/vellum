import type React from 'react';
import { useRef } from 'react';
import type { TooltipInfo } from '@vellum/core';
import { useTranslation } from 'react-i18next';

/** Props for the `MapTooltip` component. */
export interface MapTooltipProps {
  /** Hover info from the renderer, or `null` to hide the tooltip. */
  info: TooltipInfo | null;
  /** Width of the host canvas container (px) — used for edge-aware positioning. */
  containerWidth: number;
  /** Height of the host canvas container (px) — used for edge-aware positioning. */
  containerHeight: number;
}

const TOOLTIP_WIDTH = 200;
const TOOLTIP_HEIGHT_FALLBACK = 60;
const OFFSET = 12;

function computeStyle(
  x: number,
  y: number,
  cw: number,
  ch: number,
  tooltipHeight: number,
): React.CSSProperties {
  const flipX = x + TOOLTIP_WIDTH + OFFSET > cw;
  const flipY = y + tooltipHeight + OFFSET > ch;
  return {
    position: 'absolute',
    left: Math.max(0, flipX ? x - TOOLTIP_WIDTH - OFFSET : x + OFFSET),
    top: Math.max(0, flipY ? y - tooltipHeight - OFFSET : y + OFFSET),
    pointerEvents: 'none',
    zIndex: 50,
  };
}

/**
 * Floating tooltip that appears when hovering over a transit stop or a
 * district marker on the map.
 *
 * @remarks
 * Renders `null` when `info` is `null`. Branches on `info.kind`: a transit
 * stop lists the lines serving it, headed by the stop's name when the
 * document has one (native `.vellummap`; a derived name is marked as such —
 * `.cslmap` stops have no names), while districts render a single-line name.
 * Positioned with edge-awareness so it stays within the canvas container.
 */
export function MapTooltip({
  info,
  containerWidth,
  containerHeight,
}: MapTooltipProps) {
  const { t } = useTranslation();
  const divRef = useRef<HTMLDivElement>(null);
  if (!info) return null;
  const measuredHeight =
    divRef.current?.offsetHeight || TOOLTIP_HEIGHT_FALLBACK;
  const style = computeStyle(
    info.screenX,
    info.screenY,
    containerWidth,
    containerHeight,
    measuredHeight,
  );

  if (info.kind === 'district') {
    return (
      <div
        ref={divRef}
        style={style}
        className="bg-neutral-900/95 text-white rounded-md shadow-lg px-3 py-2 text-sm min-w-28 max-w-52"
      >
        <span className="text-xs opacity-90 truncate block">{info.name}</span>
      </div>
    );
  }

  return (
    <div
      ref={divRef}
      style={style}
      className="bg-neutral-900/95 text-white rounded-md shadow-lg px-3 py-2 text-sm min-w-28 max-w-52"
    >
      {info.stopName ? (
        <div className="mb-1.5">
          <span
            className="text-xs font-medium truncate block"
            title={info.stopName}
          >
            {info.stopName}
          </span>
          {info.stopNameDerived ? (
            <span className="text-[10px] opacity-50 italic block">
              {t('mapTooltip.derivedStopName')}
            </span>
          ) : null}
        </div>
      ) : null}
      <ul className="flex flex-col gap-1">
        {info.lines.map((line) => {
          const modeLabel = t(`transitModes.${line.mode}`, {
            defaultValue: '',
          });

          return (
            <li
              key={`${line.name}:${line.color}`}
              className="flex items-center gap-1.5"
            >
              <span
                aria-hidden="true"
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: line.color }}
              />
              <span className="text-xs opacity-90 truncate flex-1">
                {line.name}
              </span>

              {modeLabel ? (
                <span className="text-xs opacity-50 italic shrink-0 ml-2">
                  {modeLabel}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
