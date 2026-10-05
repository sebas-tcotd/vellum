import embedCss from '@vellum/ui/embed.css?inline';
import frameCss from './embed-frame.css?inline';

/**
 * Tailwind v4 registers its `--tw-*` properties with `@property`. Chromium
 * ignores `@property` inside a shadow root, so without them in the document
 * shadows, rings and transforms of the embedded components lose their
 * initial values.
 */
const PROPERTY_RULE = /@property\s+--[\w-]+\s*\{[^{}]*\}/g;

/** `@property` rules lifted out of the compiled embed.css, for the document. */
export const documentCss = (embedCss.match(PROPERTY_RULE) ?? []).join('\n');

/** Everything else, for each shadow root, plus the frame. */
export const shadowCss = `${embedCss.replace(PROPERTY_RULE, '')}\n${frameCss}`;

// If Tailwind changes the shape of its `@property` rules, the regex would
// silently lift nothing: fail the build instead.
if (
  embedCss.includes('@property') &&
  (documentCss === '' || shadowCss.includes('@property'))
) {
  throw new Error(
    'embed-css: could not lift every @property rule out of embed.css; update PROPERTY_RULE',
  );
}
