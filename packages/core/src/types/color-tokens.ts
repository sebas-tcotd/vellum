/** Hexadecimal color string (e.g. `#a098b0`). */
export type HexColor = `#${string}`;

/** CSS `hsl()` color function string (e.g. `hsl(210, 40%, 60%)`). */
export type HslColor = `hsl(${string})`;

/** A color value accepted anywhere `RenderStyleParams` expects a color. */
export type ColorToken = HexColor | HslColor;
