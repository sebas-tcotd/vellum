import { useTranslation } from 'react-i18next';
import { Button } from '../../lib/button';
import { cn } from '../../lib/utils';

/**
 * How much of the interface a crash took down.
 *
 * - `app`: the whole window; recovering means reloading the page.
 * - `view`: only the map or schematic area; the shell around it still works.
 */
export type CrashScope = 'app' | 'view';

/** Props for {@link CrashFallback}. */
export interface CrashFallbackProps {
  /** Which surface failed; picks the copy, the action label and the layout. */
  scope: CrashScope;
  /** The value React caught. Anything can be thrown, not only `Error`. */
  error: unknown;
  /** Called by the recovery button. */
  onRecover: () => void;
}

/** Stack lines kept in the details block: enough to locate the failure. */
const MAX_STACK_LINES = 12;

/**
 * Formats a caught value for the details block a user can paste into an issue.
 *
 * @remarks
 * Release builds have no log sink a user can reach (no `tauri-plugin-log`), so
 * this text is the only diagnostic a reporter can send back. It carries the
 * error and its stack, never city data.
 */
export function describeCrash(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const head = `${error.name}: ${error.message}`;
  const stack = error.stack
    ?.split('\n')
    .filter((line) => line.trim() !== '' && !line.includes(error.message))
    .slice(0, MAX_STACK_LINES)
    .join('\n');
  return stack ? `${head}\n${stack}` : head;
}

/**
 * Message shown in place of a surface that crashed while rendering, instead of
 * leaving it blank.
 */
export function CrashFallback({ scope, error, onRecover }: CrashFallbackProps) {
  const { t } = useTranslation();
  const isApp = scope === 'app';

  return (
    <div
      role="alert"
      className={cn(
        'flex items-center justify-center bg-background p-6 text-foreground',
        isApp ? 'fixed inset-0 z-[100]' : 'absolute inset-0 z-40',
      )}
    >
      <div className="flex max-w-md flex-col gap-4">
        <h1 className="text-lg font-semibold">
          {isApp ? t('crash.appTitle') : t('crash.viewTitle')}
        </h1>
        <p className="text-sm leading-relaxed opacity-80">
          {isApp ? t('crash.appBody') : t('crash.viewBody')}
        </p>
        <div>
          <Button type="button" onClick={onRecover}>
            {isApp ? t('crash.reloadApp') : t('crash.reloadView')}
          </Button>
        </div>
        <details className="text-xs">
          <summary className="cursor-pointer opacity-80">
            {t('crash.details')}
          </summary>
          <p className="mt-2 opacity-80">{t('crash.reportHint')}</p>
          <pre className="mt-2 max-h-48 select-text overflow-auto whitespace-pre-wrap break-words rounded-md border border-input p-2 font-mono">
            {describeCrash(error)}
          </pre>
        </details>
      </div>
    </div>
  );
}
