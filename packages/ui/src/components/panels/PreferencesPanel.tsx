import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../lib/dialog';
import { Switch } from '../../lib/switch';
import { useVellumStore } from '../../store/vellum-store';

/** Props for the controlled app-preferences dialog. */
export interface PreferencesPanelProps {
  /** Whether the Radix dialog is open. */
  open: boolean;
  /** Receives all controlled-open state changes, including Escape/click-outside. */
  onOpenChange: (open: boolean) => void;
}

/**
 * Controlled preferences dialog: language selection and auto-update toggle.
 *
 * @remarks
 * Every control commits immediately to `useVellumStore` — there is no "Save"
 * button (AC3). Persistence and the i18next hot-swap are already encapsulated
 * inside `setLanguage`/`setAutoUpdateEnabled` (Story 7.2); this component only
 * invokes those actions, never `i18n.changeLanguage` or the preferences store
 * directly.
 */
export function PreferencesPanel({
  open,
  onOpenChange,
}: PreferencesPanelProps) {
  const { t } = useTranslation();
  const activeLanguage = useVellumStore((s) => s.activeLanguage);
  const setLanguage = useVellumStore((s) => s.setLanguage);
  const autoUpdateEnabled = useVellumStore((s) => s.autoUpdateEnabled);
  const setAutoUpdateEnabled = useVellumStore((s) => s.setAutoUpdateEnabled);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('preferences.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <span className="font-ui text-xs font-semibold">
              {t('preferences.language')}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                aria-pressed={activeLanguage === 'en'}
                onClick={() => setLanguage('en')}
                className={
                  activeLanguage === 'en'
                    ? 'rounded-md border border-primary bg-primary/10 px-3 py-1 text-xs font-semibold'
                    : 'rounded-md border border-panel-border px-3 py-1 text-xs'
                }
              >
                {t('preferences.language_en')}
              </button>
              <button
                type="button"
                aria-pressed={activeLanguage === 'es'}
                onClick={() => setLanguage('es')}
                className={
                  activeLanguage === 'es'
                    ? 'rounded-md border border-primary bg-primary/10 px-3 py-1 text-xs font-semibold'
                    : 'rounded-md border border-panel-border px-3 py-1 text-xs'
                }
              >
                {t('preferences.language_es')}
              </button>
            </div>
          </div>
          <label className="flex items-center justify-between gap-2 text-xs font-semibold">
            <span>{t('preferences.autoUpdate')}</span>
            <Switch
              checked={autoUpdateEnabled}
              onCheckedChange={setAutoUpdateEnabled}
            />
          </label>
        </div>
      </DialogContent>
    </Dialog>
  );
}
