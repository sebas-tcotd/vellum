import type { ReactNode } from 'react';

export interface DesktopShellProps {
  children: ReactNode;
}

/**
 * Single composition window for the desktop chrome and the cartographic
 * surface. Platform differences live in CSS tokens, never in this tree.
 */
export function DesktopShell({ children }: DesktopShellProps) {
  return (
    <div className="desktop-shell" data-testid="desktop-shell">
      <div
        className="shell-titlebar-drag-region"
        data-tauri-drag-region
        aria-hidden="true"
      />
      {children}
    </div>
  );
}
