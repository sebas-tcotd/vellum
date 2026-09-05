// packages/ui/src/context/PlatformContext.tsx
import { createContext, useContext, useLayoutEffect } from 'react';
import type { ReactNode } from 'react';

/**
 * OS platform Vellum's shell chrome adapts to.
 *
 * @remarks
 * `'unknown'` is the safe fallback for any unsupported platform (e.g.
 * `freebsd`) or a failed detection call — per the story's edge-case matrix,
 * platform detection must never throw or block app startup.
 */
export type Platform = 'windows' | 'macos' | 'linux' | 'unknown';

interface PlatformMeta {
  platform: Platform;
}

const PlatformContext = createContext<PlatformMeta | null>(null);

/**
 * Injects the detected OS platform into `@vellum/ui` as a typed value, mirroring
 * `AppMetaProvider`/`version`.
 *
 * @remarks
 * The only place `@vellum/ui` learns which OS it runs on — the detection
 * itself happens exclusively in the composition root (`apps/desktop`), never
 * here. Also sets `data-platform` on `<html>` so `globals.css` can scope shell
 * tokens (`--shell-*`) per platform without any JSX branching per OS.
 *
 * `useLayoutEffect` (not `useEffect`) sets the attribute before the browser
 * paints, so the shell never flashes the neutral profile before the real one
 * applies; the cleanup removes the attribute on unmount so a later
 * `PlatformProvider` instance (e.g. in isolated component tests) never
 * inherits a stale platform from a previous one.
 */
export function PlatformProvider({
  platform,
  children,
}: PlatformMeta & { children: ReactNode }) {
  useLayoutEffect(() => {
    document.documentElement.dataset.platform = platform;
    return () => {
      delete document.documentElement.dataset.platform;
    };
  }, [platform]);

  return (
    <PlatformContext.Provider value={{ platform }}>
      {children}
    </PlatformContext.Provider>
  );
}

/** Reads the current platform. Throws outside `<PlatformProvider>`, same contract as `useAppMeta`. */
export function usePlatform(): PlatformMeta {
  const ctx = useContext(PlatformContext);
  if (!ctx)
    throw new Error('usePlatform must be used within <PlatformProvider>');
  return ctx;
}
