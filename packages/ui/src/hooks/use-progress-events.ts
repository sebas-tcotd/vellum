import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { IPC_EVENTS } from '@vellum/core';
import type { ProgressPayload } from '@vellum/core';

export function useProgressEvents() {
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    listen<ProgressPayload>(IPC_EVENTS.PROGRESS, (event) => {
      if (!cancelled) setPercent(event.payload.percent);
    })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch((err: unknown) => {
        console.error('[useProgressEvents] Failed to register listener:', err);
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return { percent };
}
