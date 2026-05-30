import { useEffect } from 'react';

interface UseKeyboardShortcutsOptions {
  onOpenFile: () => void;
  /**
   * When false, the shortcut handler does nothing without removing the listener.
   * @default true
   */
  enabled?: boolean;
}

export function useKeyboardShortcuts({
  onOpenFile,
  enabled = true,
}: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!enabled) return;
      const isModKey = e.ctrlKey || e.metaKey;
      if (isModKey && !e.shiftKey && !e.altKey && e.key === 'o') {
        e.preventDefault();
        onOpenFile();
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onOpenFile, enabled]);
}
