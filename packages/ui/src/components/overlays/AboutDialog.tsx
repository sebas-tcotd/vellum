import { openUrl } from '@tauri-apps/plugin-opener';
import { ExternalLink } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../lib/dialog';
import { VellumIsotypeRounded } from '../../lib/vellum-isotype-rounded';

export interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version?: string | undefined;
}

/** Vellum-owned About surface; kept in the web UI so it can follow Vellum's design system. */
export function AboutDialog({
  open,
  onOpenChange,
  version = '0.0.0',
}: AboutDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-w-120 overflow-hidden rounded-(--shell-radius-panel) border-(--shell-border) bg-(--shell-surface-popover) p-0 text-(--shell-text-primary) shadow-(--shell-shadow-floating) backdrop-blur-(--shell-blur)"
      >
        <div className="relative overflow-hidden border-b border-black/10 bg-(--color-bg) px-7 pb-7 pt-8">
          <div className="pointer-events-none absolute inset-0 opacity-40 bg-[linear-gradient(105deg,transparent_0%,transparent_49%,rgba(74,64,53,0.07)_49%,rgba(74,64,53,0.07)_50%,transparent_50%),linear-gradient(25deg,transparent_0%,transparent_68%,rgba(109,184,183,0.12)_68%,rgba(109,184,183,0.12)_69%,transparent_69%)]" />
          <div className="pointer-events-none absolute -right-14 -top-20 size-52 rounded-full border border-(--color-water)/25" />
          <div className="pointer-events-none absolute -right-5 -top-11 size-32 rounded-full border border-(--color-water)/15" />
          <div className="relative flex items-start gap-4">
            <div className="relative flex size-16 shrink-0 items-center justify-center rounded-full bg-(--color-text) text-(--color-bg) shadow-[0_8px_18px_rgba(51,51,51,0.16)]">
              <VellumIsotypeRounded height="100%" width="100%" />
            </div>

            <DialogHeader className="gap-1 text-left">
              <DialogTitle
                id={titleId}
                className="font-wordmark text-[2.15rem] font-normal leading-none tracking-[0.04em] text-(--color-text)"
              >
                Vellum
              </DialogTitle>

              <DialogDescription className="font-ui text-[0.8rem] tracking-wide text-(--color-text-subtle) pl-1">
                {t('about.tagline')}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="relative mt-6 flex items-center gap-2 text-[0.62rem] font-medium uppercase tracking-[0.22em] text-(--color-text-subtle)">
            <span className="h-px w-7 bg-(--color-road-large-arterial)" />
            <span>{t('about.openCartography')}</span>
          </div>
        </div>

        <div className="space-y-6 px-7 py-6">
          <p className="max-w-prose text-[0.9rem] leading-6 text-(--shell-text-muted)">
            {t('about.description')}
          </p>

          <div className="grid grid-cols-2 divide-x divide-(--shell-border) rounded-(--shell-radius-interactive) border border-(--shell-border) bg-(--shell-surface)">
            <div className="px-4 py-3.5">
              <div className="text-[0.62rem] font-medium uppercase tracking-[0.16em] text-(--shell-text-muted)">
                {t('about.versionLabel')}
              </div>

              <div className="mt-1.5 font-mono text-sm text-(--shell-text-primary)">
                v{version}
              </div>
            </div>

            <div className="px-4 py-3.5">
              <div className="text-[0.62rem] font-medium uppercase tracking-[0.16em] text-(--shell-text-muted)">
                {t('about.licenseLabel')}
              </div>

              <div className="mt-1.5 text-sm text-(--shell-text-primary)">
                MIT
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between border-t border-(--shell-border) bg-(--shell-surface) px-7 py-4">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-(--shell-radius-interactive) px-2 py-1.5 text-xs text-(--shell-text-muted) transition-colors hover:bg-black/5 hover:text-(--shell-text-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--shell-focus)"
            onClick={() => {
              void openUrl('https://github.com/sebas-tcotd/vellum').catch(
                (error: unknown) => {
                  console.warn(
                    'AboutDialog: failed to open repository URL',
                    error,
                  );
                },
              );
            }}
          >
            {t('about.repository')}
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center justify-center rounded-(--shell-radius-interactive) bg-(--shell-text) px-4 py-2 text-sm font-medium text-(--shell-bg) shadow-sm transition-[background-color,transform] hover:bg-(--shell-road-pedestrian) hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--shell-focus)"
          >
            {t('common.close')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
