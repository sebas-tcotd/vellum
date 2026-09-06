import { useTranslation } from 'react-i18next';
import { Download, FolderOpen } from 'lucide-react';
import type { CommandRegistry } from '../../shell/commands';
import { useOverlaySlot } from './overlay-collision';

export interface DocumentCommandGroupProps {
  commands: CommandRegistry;
}

/**
 * Document-level commands for the open map, as a compact group over the map's
 * top-right corner.
 *
 * @remarks
 * Export lives here rather than in the appearance sidebar: producing output is
 * a committed document task, not a way of adjusting how the map is drawn
 * (AD-6). Both buttons delegate to the same commands the File menu and the
 * `Cmd/Ctrl+O` / `Cmd/Ctrl+E` shortcuts use, so all three routes are one
 * action.
 *
 * It is icon-only by design: the document's identity is already carried by the
 * sidebar header and the native window title, so this group only needs to
 * offer the two actions without claiming a band of its own across the top of
 * the window.
 */
export function DocumentCommandGroup({ commands }: DocumentCommandGroupProps) {
  const { t } = useTranslation();
  const openMap = commands['document.open'];
  const exportMap = commands['document.export'];

  const { ref, style } = useOverlaySlot('documentCommands', 'top-right');

  const buttons = [
    {
      command: openMap,
      label: t('document.openMap'),
      focusId: 'document-open',
      Icon: FolderOpen,
    },
    {
      command: exportMap,
      label: t('export.exportButton'),
      focusId: 'document-export',
      Icon: Download,
    },
  ];

  return (
    <div
      ref={ref}
      style={style}
      className="shell-floating-group shell-document-commands"
      data-testid="document-command-group"
      role="group"
      aria-label={t('a11y.documentCommands')}
    >
      {buttons.map(({ command, label, focusId, Icon }) => (
        <button
          key={command.id}
          type="button"
          className="shell-floating-button"
          data-focus-id={focusId}
          aria-label={label}
          title={label}
          disabled={!command.canExecute}
          onClick={() => command.execute()}
        >
          <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
