import type { TFunction } from 'i18next';
import type { CityData, MarginaliaLabels } from '@vellum/core';

/**
 * Resolves every marginalia string in the UI, before anything reaches core.
 *
 * @remarks
 * Core never translates: it receives these strings verbatim inside the export
 * request and only lays them out. Count phrases keep a literal `{count}`
 * placeholder for core to fill, and dates are formatted here with the app's
 * own locale.
 *
 * @param t - Translation function of the active language.
 * @param locale - BCP 47 tag of the active language.
 * @param cityData - Loaded city, for its generation date.
 */
export function resolveMarginaliaLabels(
  t: TFunction,
  locale: string | undefined,
  cityData: Pick<CityData, 'generatedAt'>,
): MarginaliaLabels {
  return {
    roadLegendTitle: t('export.legend_roadsTitle'),
    roadTiers: {
      highway: t('export.legend_road_highway'),
      largeArterial: t('export.legend_road_largeArterial'),
      mediumArterial: t('export.legend_road_mediumArterial'),
      local: t('export.legend_road_local'),
      gravel: t('export.legend_road_gravel'),
      pedestrianStreet: t('export.legend_road_pedestrianStreet'),
      pedestrian: t('export.legend_road_pedestrian'),
      pedestrianWay: t('export.legend_road_pedestrianWay'),
      train: t('export.legend_road_train'),
      metro: t('export.legend_road_metro'),
    },
    transitLegendTitle: t('export.legend_transitTitle'),
    transitModes: {
      Bus: t('transitModes.Bus'),
      Tram: t('transitModes.Tram'),
      Train: t('transitModes.Train'),
      Metro: t('transitModes.Metro'),
      CableCar: t('transitModes.CableCar'),
      Monorail: t('transitModes.Monorail'),
      Ferry: t('transitModes.Ferry'),
      Blimp: t('transitModes.Blimp'),
      Trolleybus: t('transitModes.Trolleybus'),
      Unknown: t('transitModes.Unknown'),
    },
    transitMore: {
      one: t('export.legend_transitMoreOne'),
      other: t('export.legend_transitMoreOther'),
    },
    elevationLegendTitle: t('export.legend_elevationTitle'),
    summary: {
      roads: {
        one: t('export.summary_roadsOne'),
        other: t('export.summary_roadsOther'),
      },
      buildings: {
        one: t('export.summary_buildingsOne'),
        other: t('export.summary_buildingsOther'),
      },
      districts: {
        one: t('export.summary_districtsOne'),
        other: t('export.summary_districtsOther'),
      },
      parks: {
        one: t('export.summary_parksOne'),
        other: t('export.summary_parksOther'),
      },
      lines: {
        one: t('export.summary_linesOne'),
        other: t('export.summary_linesOther'),
      },
      stops: {
        one: t('export.summary_stopsOne'),
        other: t('export.summary_stopsOther'),
      },
    },
    sourceDate: formatSourceDate(cityData.generatedAt, locale),
    sourceStatement: t('export.marginalia_sourceStatement'),
    north: t('export.marginalia_north'),
    thousandsSeparator: groupSeparator(locale),
  };
}

function formatSourceDate(value: string, locale: string | undefined): string {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
      date,
    );
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function groupSeparator(locale: string | undefined): string {
  try {
    return (
      new Intl.NumberFormat(locale)
        .formatToParts(10000)
        .find((part) => part.type === 'group')?.value ?? ''
    );
  } catch {
    return '';
  }
}
