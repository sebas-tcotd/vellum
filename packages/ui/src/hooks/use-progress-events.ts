import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { IPC_EVENTS } from '@vellum/core';
import type { ProgressPayload } from '@vellum/core';

const LISTENER_TIMEOUT_MS = 5000;

export function useProgressEvents() {
  const [percent, setPercent] = useState(0);
  const [listenError, setListenError] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    // Safety timeout: if listen() never resolves, surface the error
    const timeoutId = setTimeout(() => {
      if (!unlisten && !cancelled) setListenError(true);
    }, LISTENER_TIMEOUT_MS);

    listen<ProgressPayload>(IPC_EVENTS.PROGRESS, (event) => {
      if (!cancelled) {
        setPercent(Math.min(100, Math.max(0, event.payload.percent)) || 0);
      }
    })
      .then((fn) => {
        clearTimeout(timeoutId);
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch((err: unknown) => {
        clearTimeout(timeoutId);
        console.error('[useProgressEvents] Failed to register listener:', err);
        if (!cancelled) setListenError(true);
      });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      unlisten?.();
    };
  }, []);

  return { percent, listenError };
}
