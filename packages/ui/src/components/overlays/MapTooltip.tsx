import type React from 'react';
import type { TooltipInfo } from '@vellum/renderer-webgl';
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
const TOOLTIP_HEIGHT_EST = 60;
const OFFSET = 12;

function computeStyle(
  x: number,
  y: number,
  cw: number,
  ch: number,
): React.CSSProperties {
  const flipX = x + TOOLTIP_WIDTH + OFFSET > cw;
  const flipY = y + TOOLTIP_HEIGHT_EST + OFFSET > ch;
  return {
    position: 'absolute',
    left: flipX ? x - TOOLTIP_WIDTH - OFFSET : x + OFFSET,
    top: flipY ? y - TOOLTIP_HEIGHT_EST - OFFSET : y + OFFSET,
    pointerEvents: 'none',
    zIndex: 50,
  };
}

/**
 * Floating tooltip that appears when hovering over a transit stop on the map.
 *
 * @remarks
 * Renders `null` when `info` is `null`. Transit stops in the `.cslmap` format
 * do not have names — only the transit lines serving each stop have names.
 * Positioned with edge-awareness so it stays within the canvas container.
 */
export function MapTooltip({
  info,
  containerWidth,
  containerHeight,
}: MapTooltipProps) {
  const { t } = useTranslation();
  if (!info) return null;
  const style = computeStyle(
    info.screenX,
    info.screenY,
    containerWidth,
    containerHeight,
  );
  return (
    <div
      style={style}
      className="bg-neutral-900/95 text-white rounded-md shadow-lg px-3 py-2 text-sm min-w-28 max-w-52"
    >
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
