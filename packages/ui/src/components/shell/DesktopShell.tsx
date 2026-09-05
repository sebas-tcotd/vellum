import type { ReactNode } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

export interface DesktopShellProps {
  children: ReactNode;
}

/**
 * Starts a native window drag for titlebar clicks in Tauri. The data attribute
 * remains as the declarative path, while this explicit call covers WebViews
 * where delegated drag-region handling is unavailable (notably macOS overlay
 * titlebars). The guard keeps the same shell usable in a regular browser.
 */
function startNativeWindowDrag() {
  if (
    typeof window === 'undefined' ||
    !(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  ) {
    return;
  }

  void getCurrentWindow()
    .startDragging()
    .catch((error: unknown) => {
      console.warn('[DesktopShell] Failed to start native window drag', error);
    });
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
        onMouseDown={(event) => {
          if (event.button === 0) startNativeWindowDrag();
        }}
      />
      {children}
    </div>
  );
}
