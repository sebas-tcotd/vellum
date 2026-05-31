import { useState } from 'react';
import { IPC_EVENTS } from '@vellum/core';
import type { ProgressPayload } from '@vellum/core';
import { useTauriEvent } from './use-tauri-event';

const LISTENER_TIMEOUT_MS = 5000;

export function useProgressEvents() {
  const [percent, setPercent] = useState(0);

  const { listenError } = useTauriEvent<ProgressPayload>(
    IPC_EVENTS.PROGRESS,
    (payload) => setPercent(Math.min(100, Math.max(0, payload.percent)) || 0),
    { timeoutMs: LISTENER_TIMEOUT_MS },
  );

  return { percent, listenError };
}
