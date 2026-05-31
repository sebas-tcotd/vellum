import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { VellumError } from '@vellum/core';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../lib/dialog';

export interface PartialParseDialogProps {
  error: Extract<VellumError, { type: 'PartialParse' }>;
  onPartialRender: () => void;
  onCancel: () => void;
}

/** Non-blocking modal shown when a .cslmap file has recoverable section errors.
 * Gives the user the choice to attempt partial rendering or cancel. */
export function PartialParseDialog({
  onPartialRender,
  onCancel,
}: PartialParseDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-w-md"
      >
        <DialogHeader>
          <DialogTitle id={titleId}>
            {t('errors.partialParseTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('errors.partialParseDescription')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onPartialRender}
            className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {t('errors.tryPartialRender')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
