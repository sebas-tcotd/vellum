import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from './use-keyboard-shortcuts';

const ctrl = (key: string, extra?: Partial<KeyboardEventInit>) =>
  new KeyboardEvent('keydown', { ctrlKey: true, key, bubbles: true, ...extra });

describe('useKeyboardShortcuts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Ctrl+O llama onOpenFile', () => {
    const onOpenFile = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onOpenFile }));

    document.dispatchEvent(ctrl('o'));

    expect(onOpenFile).toHaveBeenCalledOnce();
  });

  it('Ctrl+O con enabled=false no llama onOpenFile (AC 5 / Task 5)', () => {
    const onOpenFile = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onOpenFile, enabled: false }));

    document.dispatchEvent(ctrl('o'));

    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it('Ctrl+Shift+O no llama onOpenFile', () => {
    const onOpenFile = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onOpenFile }));

    document.dispatchEvent(ctrl('o', { shiftKey: true }));

    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it('Ctrl+Alt+O no llama onOpenFile', () => {
    const onOpenFile = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onOpenFile }));

    document.dispatchEvent(ctrl('o', { altKey: true }));

    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it('listener se elimina en unmount — Ctrl+O no dispara después', () => {
    const onOpenFile = vi.fn();
    const { unmount } = renderHook(() => useKeyboardShortcuts({ onOpenFile }));

    unmount();
    document.dispatchEvent(ctrl('o'));

    expect(onOpenFile).not.toHaveBeenCalled();
  });
});
