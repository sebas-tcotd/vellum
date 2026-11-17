import type { ErrorInfo, ReactNode } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { CrashFallback, type CrashScope } from './CrashFallback';

/** Props for {@link CrashBoundary}. */
export interface CrashBoundaryProps {
  /** Which surface this boundary guards; see {@link CrashScope}. */
  scope: CrashScope;
  /** The subtree to guard. */
  children: ReactNode;
}

/**
 * Catches render errors in its subtree and shows {@link CrashFallback} instead.
 *
 * @remarks
 * Without a boundary, React 19 unmounts the whole root on an uncaught render
 * error, which left users with an empty grey window (issue #188). An `app`
 * boundary recovers by reloading the page; a `view` boundary remounts only its
 * subtree, so the open city and the shell around it survive.
 *
 * Errors thrown in event handlers, timers, promises or MapLibre's own callbacks
 * never reach a boundary; this only covers rendering.
 */
export function CrashBoundary({ scope, children }: CrashBoundaryProps) {
  const logCrash = (error: unknown, info: ErrorInfo) => {
    console.error(`[CrashBoundary:${scope}]`, error, info.componentStack);
  };
  const renderFallback = ({ error, resetErrorBoundary }: FallbackProps) => (
    <CrashFallback
      scope={scope}
      error={error}
      onRecover={
        scope === 'app' ? () => window.location.reload() : resetErrorBoundary
      }
    />
  );

  return (
    <ErrorBoundary fallbackRender={renderFallback} onError={logCrash}>
      {children}
    </ErrorBoundary>
  );
}
