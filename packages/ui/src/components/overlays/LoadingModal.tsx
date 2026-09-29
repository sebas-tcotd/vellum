import { useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ParseKeys } from 'i18next';
import { Progress } from '../../lib/progress';
import { useProgressEvents } from '../../hooks/use-progress-events';
import { useVellumStore } from '../../store/vellum-store';

/**
 * Share of the bar the parser fills; the map drawing takes the rest. Measured on
 * Costa Tijuca (release): ~0.4 s parsing against ~1.3 s until the map is painted.
 */
const PARSE_SHARE = 0.3;

/** Where the bar glides while the map draws. Never 100: that would claim done. */
const DRAWING_TARGET = 95;

/** Progress steps the `.vellummap` reader emits, with the label each one shows. */
const VELLUMMAP_STEPS: Record<string, ParseKeys> = {
  document: 'loading.document',
  terrain: 'loading.terrain',
};

/** Progress steps the `.cslmap` parser emits; they all read "Loading cslmap". */
const CSLMAP_STEPS = new Set(['reading', 'parsing']);

/**
 * Modal shown while a city opens: from the file pick until the map is painted.
 *
 * @remarks
 * Two phases. While the parser runs, the bar follows its progress events and the
 * text names the step. Once the city is in the store, the map still has to draw
 * it (more than half the wait on a large city), so the text switches to "Drawing
 * the map" and the bar glides towards {@link DRAWING_TARGET}. It moves by
 * `transform`, so the glide keeps going while the main thread builds the map
 * sources. A `.cslmap` shows "Loading cslmap" throughout.
 */
export function LoadingModal() {
  const { t } = useTranslation();
  const titleId = useId();
  const { percent, step } = useProgressEvents();
  const isDrawing = useVellumStore((state) => state.isDrawingMap);
  const source = useVellumStore((state) => state.cityData?.source);

  // Both formats end their parse with `done`, which names neither: remember
  // which one the earlier steps belonged to.
  const isCslmapRef = useRef(false);
  if (step !== null && CSLMAP_STEPS.has(step)) isCslmapRef.current = true;
  if (step !== null && step in VELLUMMAP_STEPS) isCslmapRef.current = false;
  const isCslmap = isDrawing ? source === 'cslmap' : isCslmapRef.current;

  const labelKey: ParseKeys | null = isCslmap
    ? 'loading.cslmap'
    : isDrawing || step === 'done'
      ? 'loading.drawing'
      : step !== null
        ? (VELLUMMAP_STEPS[step] ?? null)
        : null;
  const label = labelKey ? t(labelKey) : '';
  const value = isDrawing ? DRAWING_TARGET : percent * PARSE_SHARE;

  return (
    <div
      data-testid="loading-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-[2px]"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-border bg-background p-6 shadow-2xl"
      >
        <h2 id={titleId} className="text-base font-semibold">
          {t('loading.title')}
        </h2>
        {/* Non-breaking space keeps the line's height before the first step arrives. */}
        <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
          {label || ' '}
        </p>
        <Progress
          className="mt-5 h-2"
          indicatorClassName={
            isDrawing ? 'duration-[1500ms] ease-out' : 'duration-200'
          }
          value={value}
          aria-label={t('a11y.loadingProgress')}
          aria-valuenow={Math.round(value)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={label}
        />
      </div>
    </div>
  );
}
