import { useTranslation } from 'react-i18next';
import { Compass, Maximize, Minus, Plus } from 'lucide-react';
import type { CommandRegistry } from '../../shell/commands';
import { useOverlaySlot } from './overlay-collision';

export interface CameraControlGroupProps {
  commands: CommandRegistry;
  /** Current map bearing. Reset north is offered only when the map is rotated. */
  bearing: number;
}

/**
 * The compact camera cluster over the map.
 *
 * @remarks
 * Manipulating the viewpoint is a spatial act, so it belongs on the map rather
 * than in the sidebar. Every button delegates to the shared command — there is
 * no camera logic here — so the View menu, the shortcuts and these controls
 * are one action each (AD-3). It stacks *above* the minimap and never merges
 * with it: the minimap is a separate navigational tool that owns its corner.
 *
 * Precise rotation stays on the View menu and `Shift+Arrow`; only the reset is
 * frequent enough to earn a place here, and only while it means something.
 */
export function CameraControlGroup({
  commands,
  bearing,
}: CameraControlGroupProps) {
  const { t } = useTranslation();
  const { ref, style } = useOverlaySlot('camera', 'bottom-right');

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

  return (
    <div
      ref={ref}
      style={style}
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
          disabled={!command.canExecute}
          onClick={() => command.execute()}
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
  );
}
