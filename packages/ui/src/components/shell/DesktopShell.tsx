import type { ReactNode } from 'react';

export interface DesktopShellProps {
  children: ReactNode;
}

/**
 * Ventana de composición única para el chrome de escritorio y la superficie
 * cartográfica. Las variantes de plataforma viven en tokens CSS, no en JSX.
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
