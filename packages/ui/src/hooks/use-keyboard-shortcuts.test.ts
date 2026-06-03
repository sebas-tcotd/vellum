import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from './use-keyboard-shortcuts';

const ctrl = (key: string, extra?: Partial<KeyboardEventInit>) =>
  new KeyboardEvent('keydown', { ctrlKey: true, key, bubbles: true, ...extra });

const key = (k: string, extra?: Partial<KeyboardEventInit>) =>
  new KeyboardEvent('keydown', { key: k, bubbles: true, ...extra });

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

  // Layer shortcut tests (keys 1-7)
  it('tecla 1 llama onToggleLayer con terrain', () => {
    const onOpenFile = vi.fn();
    const onToggleLayer = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onOpenFile, onToggleLayer }));

    document.dispatchEvent(key('1'));

    expect(onToggleLayer).toHaveBeenCalledWith('terrain');
  });

  it('tecla 2 llama onToggleLayer con water', () => {
    const onOpenFile = vi.fn();
    const onToggleLayer = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onOpenFile, onToggleLayer }));

    document.dispatchEvent(key('2'));

    expect(onToggleLayer).toHaveBeenCalledWith('water');
  });

  it('tecla 7 llama onToggleLayer con districts', () => {
    const onOpenFile = vi.fn();
    const onToggleLayer = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onOpenFile, onToggleLayer }));

    document.dispatchEvent(key('7'));

    expect(onToggleLayer).toHaveBeenCalledWith('districts');
  });

  it('tecla 4 con enabled=false no llama onToggleLayer', () => {
    const onOpenFile = vi.fn();
    const onToggleLayer = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts({ onOpenFile, onToggleLayer, enabled: false }),
    );

    document.dispatchEvent(key('4'));

    expect(onToggleLayer).not.toHaveBeenCalled();
  });

  it('Ctrl+4 no llama onToggleLayer (solo tecla sin modificadores)', () => {
    const onOpenFile = vi.fn();
    const onToggleLayer = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onOpenFile, onToggleLayer }));

    document.dispatchEvent(ctrl('4'));

    expect(onToggleLayer).not.toHaveBeenCalled();
  });

  it('tecla 1 sin onToggleLayer no falla (backward compatible)', () => {
    const onOpenFile = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onOpenFile }));

    expect(() => document.dispatchEvent(key('1'))).not.toThrow();
  });

  it('Ctrl+0 llama onFitToScreen', () => {
    const onOpenFile = vi.fn();
    const onFitToScreen = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onOpenFile, onFitToScreen }));

    document.dispatchEvent(ctrl('0'));

    expect(onFitToScreen).toHaveBeenCalledOnce();
  });
});
