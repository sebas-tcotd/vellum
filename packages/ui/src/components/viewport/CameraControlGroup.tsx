import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Compass, Maximize, Minus, Plus } from 'lucide-react';
import type { CommandRegistry } from '../../shell/commands';
import type { MapZoomState } from '@vellum/core';

/** Float noise from a camera that clamps by arithmetic is not "room left". */
const ZOOM_EPSILON = 1e-6;

export interface CameraControlGroupProps {
  commands: CommandRegistry;
  /**
   * Current map bearing. Reset north is offered only when the map is rotated,
   * so the schematic passes 0.
   */
  bearing: number;
  getZoomState: () => MapZoomState | null;
  subscribeZoom: (callback: () => void) => () => void;
  onZoomChange: (zoom: number) => void;
  /** Filled with the popover toggle so the precise zoom command can reach it. */
  toggleRef?: React.RefObject<(() => void) | null>;
}

/**
 * The compact camera cluster over the map.
 *
 * @remarks
 * Manipulating the viewpoint is a spatial act, so it belongs on the map rather
 * than in the sidebar. Every button delegates to the shared command — there is
 * no camera logic here — so the View menu, the shortcuts and these controls
 * are one action each (AD-3). It sits above the minimap in the shared map
 * tools column while remaining its own control group.
 *
 * Precise rotation stays on the View menu and `Shift+Arrow`; only the reset is
 * frequent enough to earn a place here, and only while it means something.
 * Precise zoom follows the same rule: it stays out of sight until Option/Alt+
 * click on + or −, or `⌘/Ctrl+⌥/Alt+Z`, opens a vertical slider beside the
 * group.
 */
export function CameraControlGroup({
  commands,
  bearing,
  getZoomState,
  subscribeZoom,
  onZoomChange,
  toggleRef,
}: CameraControlGroupProps) {
  const { t } = useTranslation();
  const [zoomState, setZoomState] = useState<MapZoomState | null>(null);
  const [isPreciseOpen, setIsPreciseOpen] = useState(false);
  useEffect(() => {
    const syncZoom = () => {
      const next = getZoomState();
      setZoomState((current) =>
        current?.zoom === next?.zoom &&
        current?.min === next?.min &&
        current?.max === next?.max
          ? current
          : next,
      );
    };
    syncZoom();
    return subscribeZoom(syncZoom);
  }, [getZoomState, subscribeZoom]);

  const togglePrecise = useCallback(
    () => setIsPreciseOpen((open) => !open),
    [],
  );
  useEffect(() => {
    if (!toggleRef) return;
    toggleRef.current = togglePrecise;
    return () => {
      if (toggleRef.current === togglePrecise) toggleRef.current = null;
    };
  }, [toggleRef, togglePrecise]);

  const buttons = [
    { command: commands['view.zoomIn'], label: t('camera.zoomIn'), Icon: Plus },
    {
      command: commands['view.zoomOut'],
      label: t('camera.zoomOut'),
      Icon: Minus,
    },
    {
      command: commands['view.fitCity'],
      label: t('camera.fitCity'),
      Icon: Maximize,
    },
  ];
  // At either end of the range the button would do nothing, so it says so.
  // The state is optional while the camera has not reported one yet.
  const atLimit = (id: string) =>
    zoomState !== null &&
    ((id === 'view.zoomIn' && zoomState.zoom >= zoomState.max - ZOOM_EPSILON) ||
      (id === 'view.zoomOut' &&
        zoomState.zoom <= zoomState.min + ZOOM_EPSILON));
  const isZoomButton = (id: string) =>
    id === 'view.zoomIn' || id === 'view.zoomOut';

  return (
    <div className="shell-camera-anchor">
      <div
        className="shell-camera-group"
        data-testid="camera-control-group"
        role="group"
        aria-label={t('a11y.cameraControls')}
      >
        {buttons.map(({ command, label, Icon }) => (
          <button
            key={command.id}
            type="button"
            className="shell-camera-button"
            // Icon-only controls carry both an accessible name and a tooltip
            // that appears on hover *and* on keyboard focus.
            aria-label={label}
            title={label}
            disabled={!command.canExecute || atLimit(command.id)}
            {...(isZoomButton(command.id)
              ? { 'aria-haspopup': 'dialog' as const }
              : {})}
            onClick={(event) => {
              // Option/Alt+click, like Shift+click on the layer rail, reaches
              // the precise control behind the plain action.
              if (event.altKey && isZoomButton(command.id)) {
                if (commands['view.preciseZoom'].canExecute) togglePrecise();
                return;
              }
              command.execute();
            }}
          >
            <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        ))}
        {bearing !== 0 && (
          <button
            type="button"
            className="shell-camera-button"
            aria-label={t('camera.resetNorth')}
            title={t('camera.resetNorth')}
            disabled={!commands['view.resetNorth'].canExecute}
            onClick={() => commands['view.resetNorth'].execute()}
          >
            <Compass size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      </div>
      {isPreciseOpen &&
        zoomState &&
        commands['view.preciseZoom'].canExecute && (
          <PreciseZoomPopover
            zoomState={zoomState}
            onZoomChange={onZoomChange}
            onClose={() => setIsPreciseOpen(false)}
          />
        )}
    </div>
  );
}

const formatZoom = (zoom: number) => zoom.toFixed(1);

interface PreciseZoomPopoverProps {
  zoomState: MapZoomState;
  onZoomChange: (zoom: number) => void;
  onClose: () => void;
}

/**
 * Vertical slider plus an exact value, floored at the fit-to-screen zoom.
 * Opens with the value selected, so typing a zoom and pressing Enter is the
 * fastest route.
 */
function PreciseZoomPopover({
  zoomState,
  onZoomChange,
  onClose,
}: PreciseZoomPopoverProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(formatZoom(zoomState.zoom));
  const isEditingRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  // Follows the map unless the user is typing a value.
  useEffect(() => {
    if (!isEditingRef.current) setDraft(formatZoom(zoomState.zoom));
  }, [zoomState.zoom]);

  // First rung of the shell's Escape ladder (see IconLegend). A click outside
  // the camera controls dismisses it; ± keep working with it open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    const onPointer = (e: PointerEvent) => {
      const anchor = rootRef.current?.parentElement;
      if (!anchor?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
    };
  }, [onClose]);

  const applyDraft = () => {
    isEditingRef.current = false;
    const value = Number(draft.replace(',', '.'));
    if (draft.trim() !== '' && Number.isFinite(value)) onZoomChange(value);
    else setDraft(formatZoom(zoomState.zoom));
  };

  return (
    <div
      ref={rootRef}
      className="shell-camera-zoom"
      role="dialog"
      aria-label={t('camera.preciseZoom')}
      data-testid="precise-zoom"
    >
      <input
        className="shell-camera-zoom__range"
        type="range"
        min={zoomState.min}
        max={zoomState.max}
        step={0.1}
        value={zoomState.zoom}
        aria-label={t('camera.zoomSlider')}
        aria-valuetext={formatZoom(zoomState.zoom)}
        onChange={(event) => onZoomChange(Number(event.currentTarget.value))}
      />
      <input
        ref={inputRef}
        className="shell-camera-zoom__number"
        type="text"
        inputMode="decimal"
        value={draft}
        aria-label={t('camera.zoomInput')}
        onChange={(event) => {
          isEditingRef.current = true;
          setDraft(event.currentTarget.value);
        }}
        onBlur={applyDraft}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            applyDraft();
            event.currentTarget.select();
          }
        }}
      />
    </div>
  );
}
