import { useId } from 'react';
import { ExternalLink, Map } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../lib/dialog';

export interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version?: string | undefined;
}

/** Vellum-owned About surface; kept in the web UI so it can follow Vellum's design system. */
export function AboutDialog({ open, onOpenChange, version = '0.0.0' }: AboutDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-w-[30rem] overflow-hidden border-[color:var(--shell-border)] bg-[color:var(--shell-surface-popover)] p-0 shadow-[var(--shell-shadow-floating)] backdrop-blur-[var(--shell-blur)]"
      >
        <div className="relative overflow-hidden bg-[linear-gradient(135deg,#3d7d9e_0%,#1769b0_48%,#0b4f8c_100%)] px-7 pb-7 pt-8 text-white">
          <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full border border-white/15" />
          <div className="pointer-events-none absolute -bottom-24 -left-10 h-44 w-44 rounded-full border border-white/10" />
          <div className="relative flex items-start gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/16 shadow-inner ring-1 ring-white/25">
              <Map aria-hidden="true" className="size-7" strokeWidth={1.7} />
            </div>
            <DialogHeader className="gap-1 text-left">
              <DialogTitle
                id={titleId}
                className="font-[var(--font-wordmark)] text-3xl font-normal tracking-wide text-white"
              >
                Vellum
              </DialogTitle>
              <DialogDescription className="text-sm text-white/75">
                {t('about.tagline')}
              </DialogDescription>
            </DialogHeader>
          </div>
        </div>

        <div className="space-y-5 px-7 py-6">
          <p className="max-w-prose text-sm leading-6 text-[color:var(--shell-text-muted)]">
            {t('about.description')}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-[color:var(--shell-border)] bg-[color:var(--shell-surface)] px-4 py-3">
              <div className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-[color:var(--shell-text-muted)]">
                {t('about.versionLabel')}
              </div>
              <div className="mt-1 font-mono text-sm text-[color:var(--shell-text-primary)]">
                v{version}
              </div>
            </div>
            <div className="rounded-xl border border-[color:var(--shell-border)] bg-[color:var(--shell-surface)] px-4 py-3">
              <div className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-[color:var(--shell-text-muted)]">
                {t('about.licenseLabel')}
              </div>
              <div className="mt-1 text-sm text-[color:var(--shell-text-primary)]">
                MIT
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between border-t border-[color:var(--shell-border)] bg-[color:var(--shell-surface)] px-7 py-4">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-[color:var(--shell-text-muted)] transition-colors hover:bg-black/5 hover:text-[color:var(--shell-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--shell-focus)]"
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
            className="inline-flex items-center justify-center rounded-md bg-[color:var(--color-primary)] px-4 py-2 text-sm font-medium text-[color:var(--color-primary-foreground)] transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--shell-focus)]"
          >
            {t('common.close')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
