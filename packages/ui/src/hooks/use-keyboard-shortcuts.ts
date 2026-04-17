import { useEffect } from 'react';

interface UseKeyboardShortcutsOptions {
  onOpenFile: () => void;
}

export function useKeyboardShortcuts({
  onOpenFile,
}: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'o') {
        e.preventDefault();
        onOpenFile();
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onOpenFile]);
}
