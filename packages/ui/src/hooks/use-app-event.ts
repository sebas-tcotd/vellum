import { useEffect, useRef, useState } from 'react';
import { usePlatformServices } from '../context/PlatformServicesContext';

interface UseAppEventOptions {
  /** If listen() hasn't resolved after this many ms, sets listenError = true. */
  timeoutMs?: number;
  /**
   * Called exactly once listen() settles — successfully or not. Lets a caller
   * sequence follow-up work (e.g. checking for an event that fired before the
   * listener finished attaching) after the subscription is guaranteed to be
   * live, instead of racing it.
   */
  onSettled?: () => void;
}

/**
 * Subscribes to a shell event for the lifetime of the component.
 * Handles unlisten on unmount, cancelled-flag races, and optional timeout.
 *
 * @remarks
 * The subscription itself comes from `PlatformServices` — this package never
 * names Tauri (ADR-0001). Outside a `<PlatformServicesProvider>` the no-op
 * default resolves immediately to an inert unsubscribe, so the hook settles
 * cleanly instead of timing out.
 *
 * @param event - Shell event name (e.g. `IPC_EVENTS.PROGRESS`)
 * @param handler - Called with the event payload on each emission.
 *   Stable reference not required — the hook tracks the latest value internally.
 * @param options - Optional `timeoutMs` to surface listen() failures, and `onSettled`
 *   to sequence follow-up work after the subscription attempt completes.
 * @returns `listenError` — true if listen() rejected or timed out.
 */
export function useAppEvent<T>(
  event: string,
  handler: (payload: T) => void,
  options?: UseAppEventOptions,
): { listenError: boolean } {
  const { subscribeEvent } = usePlatformServices();
  const [listenError, setListenError] = useState(false);

  // Always-fresh refs so we never need to re-subscribe when handler/onSettled identity changes
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const onSettledRef = useRef(options?.onSettled);
  onSettledRef.current = options?.onSettled;

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    const timeoutId = options?.timeoutMs
      ? setTimeout(() => {
          if (!unlisten && !cancelled) setListenError(true);
        }, options.timeoutMs)
      : null;

    subscribeEvent<T>(event, (payload) => {
      if (!cancelled) handlerRef.current(payload);
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
          `[useAppEvent] Failed to register listener for "${event}":`,
          err,
        );
        if (!cancelled) setListenError(true);
      })
      .finally(() => {
        if (!cancelled) onSettledRef.current?.();
      });

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      unlisten?.();
    };
  }, [event, subscribeEvent]); // handler is tracked via ref — intentionally excluded from deps

  return { listenError };
}
