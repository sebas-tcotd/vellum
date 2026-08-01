/** Minimal shape of the Tauri close-requested event this module needs. */
export interface CloseRequestedEvent {
  /** Stops the window from closing immediately, so cancellation can run first. */
  preventDefault: () => void;
}

/**
 * Builds the `onCloseRequested` handler that gives an active export a bounded
 * chance to cancel before the window actually closes.
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
  return async (event: CloseRequestedEvent): Promise<void> => {
    const cancel = getCancel();
    if (!cancel) return;
    event.preventDefault();
    await Promise.race([
      // A rejected cancel must never block the close — swallow it here so
      // the race always settles and `destroy()` still runs, bounded by the
      // same timeout either way.
      cancel().catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
    await destroy();
  };
}
