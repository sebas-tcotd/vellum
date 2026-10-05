import {
  AdvancedOptionsPanel,
  EmbedLocaleProvider,
  getEmbedI18n,
  PlaceCard,
  type EmbedLanguage,
  type PlaceCardData,
} from '@vellum/ui/embed';
import { RICO_COLORS } from '@vellum/core';
import { MapPin, Ruler, Tag, Users } from 'lucide-react';

const noop = () => {};

/** Props shared by the sample components. */
interface SampleProps {
  language: EmbedLanguage;
}

/** The roads layer options of a `.vellummap`, with some toggles on and some off. */
export function SampleAdvancedOptionsPanel({ language }: SampleProps) {
  return (
    <EmbedLocaleProvider language={language}>
      <AdvancedOptionsPanel
        layer="roads"
        source="vellummap"
        showStreetNames
        onToggleShowStreetNames={noop}
        showRailways
        onToggleShowRailways={noop}
        showFlights={false}
        onToggleShowFlights={noop}
        showFerries
        onToggleShowFerries={noop}
        showForestCircles={false}
        onToggleForestCircles={noop}
        showForestHeatmap={false}
        onToggleForestHeatmap={noop}
        visibleModes={[]}
        onToggleMode={noop}
        visibleCategories={[]}
        onToggleCategory={noop}
        colorByCategory={false}
        onToggleColorByCategory={noop}
        showDistrictsAsMarkers={false}
        onToggleShowDistrictsAsMarkers={noop}
        showDistrictFill={false}
        onToggleShowDistrictFill={noop}
        showParkAreas={false}
        onToggleShowParkAreas={noop}
        showContourLines={false}
        onToggleContourLines={noop}
        showColorRelief={false}
        onToggleColorRelief={noop}
        showHillshade={false}
        onToggleHillshade={noop}
        showGrid={false}
        onToggleShowGrid={noop}
      />
    </EmbedLocaleProvider>
  );
}

/** A district with key facts, a rows section and a segmented land-use bar. */
function sampleDistrict(language: EmbedLanguage): PlaceCardData {
  const t = getEmbedI18n(language).t;
  const integer = new Intl.NumberFormat(language);
  return {
    title: 'Harbor Heights',
    subtitle: `${t('placeCard.district')} · ${t('specializations.leisure')}`,
    keyFacts: [
      {
        label: t('placeCard.population'),
        value: integer.format(12480),
        icon: Users,
      },
      {
        label: t('placeCard.area'),
        value: t('placeCard.areaValue', { value: '2.4' }),
        icon: Ruler,
      },
    ],
    sections: [
      {
        kind: 'rows',
        heading: t('placeCard.details'),
        rows: [
          { label: t('placeCard.type'), value: 'Residential', icon: Tag },
          { value: 'Founded beside the old ferry pier.' },
        ],
      },
      {
        kind: 'segments',
        heading: t('placeCard.landUse'),
        segments: [
          {
            label: t('placeCard.homes'),
            value: 4210,
            color: RICO_COLORS.residential.fill,
            displayValue: integer.format(4210),
          },
          {
            label: t('placeCard.commercialJobs'),
            value: 1860,
            color: RICO_COLORS.commercial.fill,
            displayValue: integer.format(1860),
          },
          {
            label: t('placeCard.industrialJobs'),
            value: 640,
            color: RICO_COLORS.industry.fill,
            displayValue: integer.format(640),
          },
          {
            label: t('placeCard.officeJobs'),
            value: 1220,
            color: RICO_COLORS.office.fill,
            displayValue: integer.format(1220),
          },
        ],
      },
    ],
    actions: [
      {
        id: 'center',
        label: t('placeCard.centerOnMap'),
        icon: MapPin,
        onSelect: noop,
      },
    ],
  };
}

/** The place card of {@link sampleDistrict}. */
export function SamplePlaceCard({ language }: SampleProps) {
  return (
    <EmbedLocaleProvider language={language}>
      <PlaceCard data={sampleDistrict(language)} onClose={noop} />
    </EmbedLocaleProvider>
  );
}
