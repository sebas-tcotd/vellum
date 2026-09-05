import type { ReactNode } from 'react';

export interface DesktopShellProps {
  children: ReactNode;
  /**
   * Whether the document command strip is present. It occupies the titlebar
   * safe area when shown, so the sidebar must not reserve that inset twice.
   */
  hasDocumentStrip?: boolean;
}

/**
 * Single composition window for the desktop chrome and the cartographic
 * surface. Platform differences live in CSS tokens, never in this tree.
 */
export function DesktopShell({
  children,
  hasDocumentStrip = false,
}: DesktopShellProps) {
  return (
    <div
      className="desktop-shell"
      data-testid="desktop-shell"
      data-has-strip={hasDocumentStrip ? 'true' : undefined}
    >
      <div
        className="shell-titlebar-drag-region"
        data-tauri-drag-region
        aria-hidden="true"
      />
      {children}
    </div>
  );
}
