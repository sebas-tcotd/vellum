/** Minimal shape of the Tauri close-requested event this module needs. */
export interface CloseRequestedEvent {
  /** Stops the window from closing immediately, so cancellation can run first. */
  preventDefault: () => void;
}

/**
 * Builds the `onCloseRequested` handler that explicitly closes the window,
 * giving an active export a bounded chance to cancel first.
 *
 * @remarks
 * Kept as a pure function — no `@tauri-apps/api` import — so it can be unit
 * tested without booting a real window. `main.tsx` supplies the real
 * `getCancel`/`destroy` bound to `getCurrentWindow()`.
 * @param getCancel - Reads whichever bounded cancel request is currently active, or `null`.
 * @param destroy - Closes the window once cancellation has settled (or timed out).
 * @param timeoutMs - Upper bound on how long the window waits for cancellation.
 * @returns The handler to pass to `win.onCloseRequested(...)`.
 */
export function createCloseRequestedHandler(
  getCancel: () => (() => Promise<void>) | null,
  destroy: () => Promise<void>,
  timeoutMs: number,
): (event: CloseRequestedEvent) => Promise<void> {
  const scheduleDestroy = (): void => {
    // Let the native close event return to Tauri before sending the forced
    // destroy command. Awaiting it inside the close callback can deadlock the
    // WebView/event loop on packaged macOS, Windows, or Linux builds.
    setTimeout(() => {
      void destroy().catch(() => undefined);
    }, 0);
  };

  return async (event: CloseRequestedEvent): Promise<void> => {
    // Tauri's implicit close after an onCloseRequested handler returns is not
    // reliable across the packaged WebView runtimes. Always take ownership of
    // the lifecycle: prevent the native request, then force-destroy the window
    // ourselves once any active export has acknowledged cancellation.
    event.preventDefault();
    const cancel = getCancel();
    if (cancel) {
      await Promise.race([
        // A rejected cancel must never block the close — swallow it here so
        // the race always settles and `destroy()` still runs, bounded by the
        // same timeout either way.
        cancel().catch(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
      ]);
    }
    scheduleDestroy();
  };
}
