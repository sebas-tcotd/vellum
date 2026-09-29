import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import type { ParseKeys } from 'i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../lib/dialog';
import {
  SHORTCUTS,
  type Shortcut,
  type ShortcutGroup,
} from '../../shell/shortcuts';
import { useModifierCaps } from '../../context/PlatformContext';

export interface ShortcutsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Modifiers = Pick<Shortcut, 'mod' | 'shift' | 'alt'>;

const byId = (id: string) => SHORTCUTS.find((s) => s.id === id)!;

function Keys({ mods, cap }: { mods: Modifiers; cap: string }) {
  const names = useModifierCaps();
  const caps = [
    ...names.order.filter((m) => mods[m]).map((m) => names[m]),
    cap,
  ];
  return (
    <span className="shell-keys">
      {caps.map((c, i) => (
        <kbd key={i} className="shell-kbd">
          {c}
        </kbd>
      ))}
    </span>
  );
}

interface Row {
  id: string;
  label: string;
  mods: Modifiers;
  cap: string;
}

/**
 * Every keyboard shortcut, read from the same table the keyboard handler
 * matches against, so the sheet cannot advertise a key that does nothing.
 *
 * @remarks
 * The share hint leads because it answers the question that prompted the
 * sheet (Story 3.9): how to capture the city without the interface. The seven
 * per-layer keys fold into one `1–7` row each. Gestures are not keys, so they
 * are listed by hand at the end.
 */
export function ShortcutsSheet({ open, onOpenChange }: ShortcutsSheetProps) {
  const { t } = useTranslation();
  const names = useModifierCaps();

  const rowsOf = (group: ShortcutGroup): Row[] => {
    const rows = SHORTCUTS.filter(
      (s) =>
        s.group === group &&
        !s.id.startsWith('layer.') &&
        !s.id.startsWith('pan'),
    ).map((s) => ({
      id: s.id,
      label: t(`shortcuts.actions.${s.id}` as ParseKeys),
      mods: s,
      cap: s.cap,
    }));
    if (group === 'map') {
      return [
        {
          id: 'pan',
          label: t('shortcuts.actions.pan'),
          mods: byId('panLeft'),
          cap: '← ↑ → ↓',
        },
        ...rows,
      ];
    }
    if (group !== 'layers') return rows;
    const toggle = byId('layer.toggle.terrain');
    const detail = byId('layer.detail.terrain');
    return [
      {
        id: 'layer.toggle',
        label: t('shortcuts.actions.layerToggle'),
        mods: toggle,
        cap: '1–7',
      },
      {
        id: 'layer.detail',
        label: t('shortcuts.actions.layerDetail'),
        mods: detail,
        cap: '1–7',
      },
    ];
  };

  const columns: ShortcutGroup[][] = [['map'], ['layers', 'file'], ['view']];
  const hide = byId('cleanView');
  const exportMap = byId('export');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[88vh] max-w-4xl gap-6 overflow-y-auto p-7"
        // A reading sheet: focus the sheet itself, not the close button, so
        // no focus ring greets the reader (Escape and ? still close it).
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
      >
        <DialogHeader className="text-left">
          <DialogTitle className="text-lg font-semibold">
            {t('shortcuts.title')}
          </DialogTitle>
          <DialogDescription className="text-sm text-(--shell-text-muted)">
            {t('shortcuts.description')}
          </DialogDescription>
        </DialogHeader>

        <section
          className="shell-shortcuts__share"
          aria-labelledby="shortcuts-share-title"
        >
          <h3 id="shortcuts-share-title" className="text-sm font-semibold">
            {t('shortcuts.share.title')}
          </h3>
          <p className="shell-shortcuts__share-line">
            <Keys mods={hide} cap={hide.cap} />
            <span>{t('shortcuts.share.hide', { key: hide.cap })}</span>
          </p>
          <p className="shell-shortcuts__share-line">
            <Keys mods={exportMap} cap={exportMap.cap} />
            <span>{t('shortcuts.share.export')}</span>
          </p>
        </section>

        <div className="shell-shortcuts__columns">
          {columns.map((groups, i) => (
            <div key={i} className="shell-shortcuts__column">
              {groups.map((group) => (
                <section key={group} aria-labelledby={`shortcuts-${group}`}>
                  <h3
                    id={`shortcuts-${group}`}
                    className="shell-shortcuts__heading"
                  >
                    {t(`shortcuts.groups.${group}`)}
                  </h3>
                  <dl className="shell-shortcuts__list">
                    {rowsOf(group).map((row) => (
                      <Fragment key={row.id}>
                        <dt>{row.label}</dt>
                        <dd>
                          <Keys mods={row.mods} cap={row.cap} />
                        </dd>
                      </Fragment>
                    ))}
                  </dl>
                </section>
              ))}
              {i === columns.length - 1 && (
                <section aria-labelledby="shortcuts-gestures">
                  <h3
                    id="shortcuts-gestures"
                    className="shell-shortcuts__heading"
                  >
                    {t('shortcuts.groups.gestures')}
                  </h3>
                  <dl className="shell-shortcuts__list">
                    <dt>{t('shortcuts.gestures.preciseZoom')}</dt>
                    <dd>
                      <span className="shell-keys">
                        <kbd className="shell-kbd">{names.alt}</kbd>
                        <span>{t('shortcuts.gestures.clickZoom')}</span>
                      </span>
                    </dd>
                    <dt>{t('shortcuts.gestures.layerDetail')}</dt>
                    <dd>
                      <span className="shell-keys">
                        <kbd className="shell-kbd">{names.shift}</kbd>
                        <span>{t('shortcuts.gestures.clickRail')}</span>
                      </span>
                    </dd>
                    <dt>{t('shortcuts.gestures.boxZoom')}</dt>
                    <dd>
                      <span className="shell-keys">
                        <kbd className="shell-kbd">{names.shift}</kbd>
                        <span>{t('shortcuts.gestures.dragMap')}</span>
                      </span>
                    </dd>
                  </dl>
                </section>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
