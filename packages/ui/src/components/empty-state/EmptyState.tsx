// packages/ui/src/components/empty-state/EmptyState.tsx
import { useTranslation } from 'react-i18next';
import { useHintCycle } from './hooks/useHintCycle';
import { GridBackground } from './components/GridBackground';
import { DropZone } from './components/DropZone';
import { ContextualHint } from './components/ContextualHint';
import { Version } from './components/Version';

/**
 * Pantalla inicial que se muestra cuando no hay ningún mapa cargado.
 *
 * @remarks
 * **Scope de esta story (2.1):** Solo visual. El drag & drop real (Tauri events + IPC)
 * y la apertura via Ctrl+O se implementan en Story 2.2.
 *
 * **Persistencia del hint:** Usa `localStorage` (no `tauri-plugin-store`) porque es
 * un dato de onboarding ligado al primer uso, no una preferencia del usuario.
 * Story 7.2 migrará las preferencias reales a `tauri-plugin-store`.
 */
export function EmptyState() {
  const { t } = useTranslation();
  const hintPhase = useHintCycle();

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-(--color-bg) z-10">
      <GridBackground />

      <div className="relative z-1 flex flex-col items-center gap-6 text-center">
        <h1
          className="m-0 text-[32px] font-normal tracking-[0.05em] text-(--color-text)"
          style={{ fontFamily: 'var(--font-wordmark)' }}
        >
          {t('emptyState.title')}
        </h1>

        <DropZone label={t('emptyState.dropHint')}>
          <p
            className="text-base text-(--color-text-subtle) m-0"
            style={{ fontFamily: 'var(--font-ui)' }}
          >
            {t('emptyState.dropHint')}
          </p>
          <p
            className="text-sm text-(--color-text-subtle) m-0"
            style={{ fontFamily: 'var(--font-ui)' }}
          >
            {t('emptyState.orOpenWith')}{' '}
            <kbd
              className="text-xs py-0.5 px-1.5 border border-(--color-border) rounded-sm bg-black/4"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {t('emptyState.openShortcut')}
            </kbd>
          </p>
        </DropZone>

        {hintPhase !== 'hidden' && (
          <ContextualHint phase={hintPhase}>
            {t('emptyState.firstUseHint')}
          </ContextualHint>
        )}
      </div>

      <Version />
    </div>
  );
}
