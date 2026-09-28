import {
  classifyDistrictSpecialization,
  districtSpecializationColor,
  districtSpecializations,
  type District,
  type RenderStyleParams,
} from '@vellum/core';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useOverlaySlot } from '../viewport/overlay-collision';

/** Groups the names actually represented by each resolved tint, including ambiguous districts. */
export function specializationLegendGroups(
  districts: readonly District[],
  theme: RenderStyleParams,
): { colors: string[]; names: string[]; neutral: boolean }[] {
  // A name can occur in districts with different dominant sectors. Keep that
  // name once and show its actual map tints, rather than inventing a priority.
  const byName = new Map<string, Set<string>>();
  for (const district of districts) {
    if (!district.boundary?.length) continue;
    const classification = classifyDistrictSpecialization(district);
    const color = districtSpecializationColor(classification, theme);
    const names: string[] = districtSpecializations(district);
    if (classification === 'neutral') names.push('neutral');
    for (const name of names) {
      const colors = byName.get(name) ?? new Set<string>();
      colors.add(color);
      byName.set(name, colors);
    }
  }
  const groups = new Map<
    string,
    { colors: string[]; names: string[]; neutral: boolean }
  >();
  for (const [name, values] of [...byName].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const colors = [...values].sort();
    const key = colors.join('|');
    const group = groups.get(key) ?? { colors, names: [], neutral: false };
    if (name === 'neutral') group.neutral = true;
    else group.names.push(name);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Compact geographic-only legend, positioned alongside the existing icon legend. */
export function DistrictSpecializationLegend({
  districts,
  theme,
}: {
  districts: readonly District[];
  theme: RenderStyleParams;
}) {
  const { t } = useTranslation();
  const slot = useOverlaySlot('districtSpecializationLegend', 'bottom-left');
  const groups = useMemo(
    () => specializationLegendGroups(districts, theme),
    [districts, theme],
  );
  if (!groups.length) return null;
  return (
    <aside
      ref={slot.ref}
      style={{
        ...slot.style,
        maxHeight: `max(0px, calc(100% - ${Number(slot.style.bottom ?? 0)}px - var(--shell-overlay-inset, 12px)))`,
        overflowY: 'auto',
      }}
      tabIndex={0}
      aria-label={t('districtSpecialization.title')}
      className="max-w-72 rounded-lg border bg-background/95 p-3 text-xs shadow-sm"
    >
      <h3 className="font-medium">{t('districtSpecialization.title')}</h3>
      <ul className="my-2 space-y-1">
        {groups.map(({ colors, names, neutral }) => (
          <li key={colors.join('|')} className="flex items-start gap-2">
            <span aria-hidden="true" className="flex shrink-0 gap-0.5">
              {colors.map((color) => (
                <span
                  key={color}
                  className="mt-0.5 h-3 w-3 rounded-sm"
                  style={{ backgroundColor: color }}
                />
              ))}
            </span>
            <span>
              {[
                ...names.map((name) =>
                  t(`specializations.${name}`, { defaultValue: name }),
                ),
                ...(neutral ? [t('districtSpecialization.neutral')] : []),
              ].join(', ')}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">
        {t('districtSpecialization.dominance')}
      </p>
    </aside>
  );
}
