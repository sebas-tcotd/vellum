import { describe, expect, it, vi } from 'vitest';
import { createCloseRequestedHandler } from './window-close-cancel';

describe('createCloseRequestedHandler', () => {
  it('lets the window close normally when no export is active', async () => {
    const preventDefault = vi.fn();
    const destroy = vi.fn().mockResolvedValue(undefined);
    const handler = createCloseRequestedHandler(() => null, destroy, 2_000);

    await handler({ preventDefault });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });

  it('prevents the close, awaits cancellation, then destroys the window', async () => {
    const preventDefault = vi.fn();
    const destroy = vi.fn().mockResolvedValue(undefined);
    let resolveCancel: (() => void) | undefined;
    const cancel = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCancel = resolve;
        }),
    );
    const handler = createCloseRequestedHandler(() => cancel, destroy, 2_000);

    const handled = handler({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(destroy).not.toHaveBeenCalled();

    resolveCancel?.();
    await handled;

    expect(cancel).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('bounds the wait — destroys the window even if cancellation never settles', async () => {
    vi.useFakeTimers();
    try {
      const preventDefault = vi.fn();
      const destroy = vi.fn().mockResolvedValue(undefined);
      const cancel = vi.fn(() => new Promise<void>(() => undefined));
      const handler = createCloseRequestedHandler(() => cancel, destroy, 2_000);

      const handled = handler({ preventDefault });
      await vi.advanceTimersByTimeAsync(2_000);
      await handled;

      expect(destroy).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('still destroys the window even if the cancel handler rejects', async () => {
    const preventDefault = vi.fn();
    const destroy = vi.fn().mockResolvedValue(undefined);
    const cancel = vi.fn().mockRejectedValue(new Error('cancel blew up'));
    const handler = createCloseRequestedHandler(() => cancel, destroy, 2_000);

    await expect(handler({ preventDefault })).resolves.toBeUndefined();

    expect(cancel).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
  });
});
