import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';

interface UseTauriEventOptions {
  /** If listen() hasn't resolved after this many ms, sets listenError = true. */
  timeoutMs?: number;
}

/**
 * Subscribes to a Tauri event for the lifetime of the component.
 * Handles unlisten on unmount, cancelled-flag races, and optional timeout.
 *
 * @param event - Tauri event name (e.g. `IPC_EVENTS.PROGRESS`)
 * @param handler - Called with the event payload on each emission.
 *   Stable reference not required — the hook tracks the latest value internally.
 * @param options - Optional `timeoutMs` to surface listen() failures.
 * @returns `listenError` — true if listen() rejected or timed out.
 */
export function useTauriEvent<T>(
  event: string,
  handler: (payload: T) => void,
  options?: UseTauriEventOptions,
): { listenError: boolean } {
  const [listenError, setListenError] = useState(false);

  // Always-fresh ref so we never need to re-subscribe when handler identity changes
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    const timeoutId = options?.timeoutMs
      ? setTimeout(() => {
          if (!unlisten && !cancelled) setListenError(true);
        }, options.timeoutMs)
      : null;

    listen<T>(event, (e) => {
      if (!cancelled) handlerRef.current(e.payload);
    })
      .then((fn) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
          setListenError(false);
        }
      })
      .catch((err: unknown) => {
        if (timeoutId) clearTimeout(timeoutId);
        console.error(
          `[useTauriEvent] Failed to register listener for "${event}":`,
          err,
        );
        if (!cancelled) setListenError(true);
      });

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      unlisten?.();
    };
  }, [event]); // handler is tracked via ref — intentionally excluded from deps

  return { listenError };
}
