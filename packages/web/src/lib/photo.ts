/**
 * Choosing an image rendition. Pure, so the size arithmetic that keeps a squad
 * table from pulling megabytes is testable without rendering anything.
 *
 * TheSportsDB serves three sizes of the same portrait behind a path suffix.
 * Measured against the live CDN (the API documents none of this):
 *
 *   (none)     700×700   123 KB
 *   /preview   250×250    20 KB
 *   /tiny      100×100     5 KB
 *
 * A 25-row squad table at full size is ~3 MB, so every slot asks for the
 * smallest rendition that still covers it.
 */

/** Rendition suffix → the pixel width it delivers. */
const RENDITIONS = [
  { suffix: "/tiny", width: 100 },
  { suffix: "/preview", width: 250 },
] as const;

/** Retina: a 32px avatar needs 64 real pixels. */
const DPI_SCALE = 2;

/**
 * The smallest rendition that still covers `size` at 2× DPI, or the URL
 * untouched. The suffix trick is TheSportsDB's alone, so any other host is left
 * exactly as the dataset gave it — as is a URL that already names a rendition.
 */
export function photoAtSize(src: string, size: number): string {
  if (!/thesportsdb\.com/i.test(src) || /\/(preview|tiny)$/.test(src)) return src;
  const fits = RENDITIONS.find((r) => r.width >= size * DPI_SCALE);
  return fits ? `${src}${fits.suffix}` : src;
}
