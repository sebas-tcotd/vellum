import { useTranslation } from 'react-i18next';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { CitySource } from '@vellum/core';

export interface DocumentContextHeaderProps {
  cityName: string;
  fileName: string;
  /**
   * Document the city came from. Only `'cslmap'` is labelled — with a discreet
   * chip, never a banner — because the native document is the normal case.
   */
  source?: CitySource | undefined;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /**
   * Whether this view offers the collapse control at all. The schematic
   * sidebar is the only home of its filters and legend, so it stays expanded
   * and omits the button rather than offering a control that does nothing.
   */
  collapsible?: boolean;
}

/**
 * Which city is open, and the control that collapses the sidebar to its rail.
 *
 * @remarks
 * The city is the orientation; the source file is technical metadata and is
 * demoted to an on-demand disclosure. `<details>` carries the open/close
 * semantics, keyboard operation and accessible state natively.
 */
export function DocumentContextHeader({
  cityName,
  fileName,
  source,
  collapsed,
  onToggleCollapsed,
  collapsible = true,
}: DocumentContextHeaderProps) {
  const { t } = useTranslation();
  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <div
      className="shell-context-header"
      data-collapsed={collapsed || undefined}
    >
      {!collapsed && (
        <div className="shell-context-header__identity">
          <div className="shell-context-header__title">
            <h1 className="shell-context-header__city" title={cityName}>
              {cityName}
            </h1>
            {source === 'cslmap' && (
              <span
                className="shell-context-header__chip"
                title={t('documentContext.cslmapChipHint')}
              >
                {t('documentContext.cslmapChip')}
              </span>
            )}
          </div>
          <details className="shell-context-header__file">
            <summary>{t('documentContext.sourceFile')}</summary>
            <p title={fileName}>{fileName}</p>
          </details>
        </div>
      )}
      {collapsible && (
        <button
          type="button"
          className="shell-icon-button"
          data-focus-id="sidebar-collapse"
          aria-expanded={!collapsed}
          aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          title={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          onClick={onToggleCollapsed}
        >
          <CollapseIcon size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
