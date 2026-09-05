import { useTranslation } from 'react-i18next';
import { Download, FolderOpen } from 'lucide-react';
import type { CommandRegistry } from '../../shell/commands';

export interface DocumentCommandStripProps {
  cityName: string;
  commands: CommandRegistry;
}

/**
 * Document-level commands for the open map.
 *
 * @remarks
 * Export lives here rather than in the appearance sidebar: producing output is
 * a committed document task, not a way of adjusting how the map is drawn
 * (AD-6). Both buttons delegate to the same commands the File menu and the
 * `Cmd/Ctrl+O` / `Cmd/Ctrl+E` shortcuts use, so all three routes are one
 * action. The strip is supplementary by design — it compacts away on narrow
 * desktops (see `globals.css`), where the menu and shortcuts still carry every
 * command.
 */
export function DocumentCommandStrip({
  cityName,
  commands,
}: DocumentCommandStripProps) {
  const { t } = useTranslation();
  const openMap = commands['document.open'];
  const exportMap = commands['document.export'];

  return (
    <div className="shell-document-strip" data-testid="document-command-strip">
      <span className="shell-document-strip__city">{cityName}</span>
      <div className="shell-document-strip__commands">
        <button
          type="button"
          className="shell-command-button"
          data-focus-id="document-open"
          disabled={!openMap.canExecute}
          onClick={() => openMap.execute()}
        >
          <FolderOpen size={14} strokeWidth={1.5} aria-hidden="true" />
          {t('document.openMap')}
        </button>
        <button
          type="button"
          className="shell-command-button"
          data-focus-id="document-export"
          disabled={!exportMap.canExecute}
          onClick={() => exportMap.execute()}
        >
          <Download size={14} strokeWidth={1.5} aria-hidden="true" />
          {t('export.exportButton')}
        </button>
      </div>
    </div>
  );
}
