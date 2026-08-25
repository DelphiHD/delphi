/**
 * Data contract for the Delphi mandala renderer.
 *
 * The same shape feeds:
 *   - renderFullMandala  → cover page of the Planetary Overview (.docx)
 *   - renderCrossMandala → start of the Incarnation Cross section
 *   - a future interactive client-portal embed (React)
 *
 * Keep this contract narrow. Callers populate it from chart data they
 * already have (mybodygraph response + parsed activations).
 */

export type ChartSide = "personality" | "design";

/** The 13 planets in the order Kaycee uses for the Planetary Overview. */
export const PLANET_ORDER = [
  "sun",
  "earth",
  "moon",
  "north-node",
  "south-node",
  "mercury",
  "mars",
  "venus",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
] as const;

export type Planet = (typeof PLANET_ORDER)[number];

export interface Activation {
  side: ChartSide;
  planet: Planet;
  /** 1-64. */
  gate: number;
  /** 1-6. */
  line: number;
  /**
   * Exact ecliptic longitude of the planet (0-360°). Determines the
   * spoke position. If omitted, the renderer falls back to the line's
   * midpoint via lib/hd/gate-longitude.
   */
  longitude?: number;
}

export interface IncarnationCross {
  personalitySun: number;
  personalityEarth: number;
  designSun: number;
  designEarth: number;
}

export interface MandalaChart {
  /** Client display name (not painted into the wheel itself). */
  clientName: string;
  /** All 26 activations (13 Personality + 13 Design). */
  activations: readonly Activation[];
  /** The four cross gates. Required for renderCrossMandala. */
  cross: IncarnationCross;
  /**
   * Raw SVG returned by the mybodygraph `design=delphi` template,
   * composited into the center of the wheel.
   */
  bodygraphSvg: string;
}

export interface RenderOptions {
  /** Output square edge in pixels. Default 1600 (suits US Letter at 200dpi). */
  size?: number;
  /**
   * Resolves a gate number (1-64) to an image URL for its I'Ching
   * hexagram glyph. May return a `data:image/png;base64,...` URL or an
   * `http(s)://...` URL. Defaults to reading PNGs from
   * `~/Desktop/Delphi Brand Assets/sections/hexagrams/{gate}.png`.
   *
   * The portal embed should pass a resolver that returns HTTP URLs from
   * a CDN or static asset path instead of inlining base64.
   */
  hexagramResolver?: (gate: number) => string;
  /** Multiply planet-glyph size. Default 1 (docx). The interactive embed uses a
   *  larger value so glyphs read clearly when the wheel is shown smaller. */
  glyphScale?: number;
}
