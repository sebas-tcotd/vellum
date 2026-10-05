import type { SampleCityDescriptor } from '@vellum/ui';

/** Immutable presentation and resource metadata for the replaceable bundled city. */
export const SAMPLE_CITY: SampleCityDescriptor & { resourcePath: string } = {
  name: 'Costa Tijuca',
  thumbnailUrl: '/sample-city.webp',
  resourcePath: 'resources/sample-city/city.vellummap',
};
