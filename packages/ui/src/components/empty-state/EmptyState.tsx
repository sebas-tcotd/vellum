// packages/ui/src/components/empty-state/EmptyState.tsx
import { useTranslation } from 'react-i18next';
import { useHintCycle } from './hooks/useHintCycle';
import { GridBackground } from './components/GridBackground';
import { DropZone } from './components/DropZone';
import { ContextualHint } from './components/ContextualHint';
import { Version } from './components/Version';

/** Presentation metadata for a city shipped by the desktop composition root. */
export interface SampleCityDescriptor {
  name: string;
  thumbnailUrl: string;
}

/** Optional desktop actions and sample presentation for the welcome surface. */
export interface EmptyStateProps {
  /** @default undefined */
  sampleCity?: SampleCityDescriptor | undefined;
  /** @default undefined */
  onOpenFile?: (() => void) | undefined;
  /** @default undefined */
  onOpenSampleCity?: (() => void) | undefined;
}

/**
 * Welcome surface with injected desktop document actions.
 *
 * @remarks
 * File picking and resource resolution remain in the desktop composition root;
 * the drop zone, document shortcut and first-use hint retain their usual behavior.
 *
 * **Persistencia del hint:** Usa `localStorage` (no `tauri-plugin-store`) porque es
 * un dato de onboarding ligado al primer uso, no una preferencia del usuario.
 * Story 7.2 migrará las preferencias reales a `tauri-plugin-store`.
 */
export function EmptyState({
  sampleCity,
  onOpenFile,
  onOpenSampleCity,
}: EmptyStateProps = {}) {
  const { t } = useTranslation();
  const hintPhase = useHintCycle();

  return (
    <div className="absolute inset-0 flex flex-col items-center overflow-y-auto bg-(--color-bg) z-10">
      <GridBackground />

      <div className="relative z-1 my-auto flex shrink-0 flex-col items-center gap-3 px-6 py-4 text-center">
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
              {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} + O
            </kbd>
          </p>
        </DropZone>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenFile}
            disabled={!onOpenFile}
            className="cursor-pointer rounded-sm border border-(--color-border) px-5 py-2 text-(--color-text) bg-(--color-bg) transition-[background-color,transform] duration-150 hover:bg-(--color-accent)/50 active:bg-(--color-accent) active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-4 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none"
          >
            {t('emptyState.openFile')}
          </button>
          {sampleCity && (
            <button
              type="button"
              onClick={onOpenSampleCity}
              disabled={!onOpenSampleCity}
              className="cursor-pointer rounded-sm border border-(--color-border) px-5 py-2 text-(--color-text) bg-(--color-bg) transition-[background-color,transform] duration-150 hover:bg-(--color-accent)/50 active:bg-(--color-accent) active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-4 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none"
            >
              {t('emptyState.openSampleCity')}
            </button>
          )}
        </div>

        {/* TODO(Story 5.5): once Vellum Bridge is public on the Workshop, name
            it in emptyState.firstUseHint too. Copy approved by Sebas:
            es: "¿Aún no tienes el archivo? Expórtalo desde Cities: Skylines con Vellum Bridge (.vellummap) o CSL Map View (.cslmap)"
            en: "No file yet? Export it from Cities: Skylines with Vellum Bridge (.vellummap) or CSL Map View (.cslmap)"
            Until then the hint names only what a player can download today. */}
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
