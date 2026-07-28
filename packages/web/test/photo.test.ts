import { describe, expect, it } from "vitest";
import { photoAtSize } from "../src/lib/photo";

const SRC = "https://r2.thesportsdb.com/images/media/player/thumb/kmzjxi1767190579.jpg";

/**
 * Sizes measured against the live CDN: full 700px/123 KB, /preview 250px/20 KB,
 * /tiny 100px/5 KB. Getting this wrong costs megabytes on a squad screen, so the
 * thresholds are pinned.
 */
describe("photoAtSize", () => {
  it("uses the 5 KB rendition for list avatars", () => {
    expect(photoAtSize(SRC, 28)).toBe(`${SRC}/tiny`); // squad table row
    expect(photoAtSize(SRC, 50)).toBe(`${SRC}/tiny`); // exactly 100px at 2x
  });

  it("steps up to the 20 KB rendition once tiny would blur", () => {
    expect(photoAtSize(SRC, 51)).toBe(`${SRC}/preview`);
    expect(photoAtSize(SRC, 64)).toBe(`${SRC}/preview`); // the detail hero
    expect(photoAtSize(SRC, 125)).toBe(`${SRC}/preview`);
  });

  it("asks for the original only when nothing smaller covers the slot", () => {
    expect(photoAtSize(SRC, 200)).toBe(SRC);
  });

  it("leaves other hosts alone — the suffix is TheSportsDB's own trick", () => {
    const other = "https://example.com/p.jpg";
    expect(photoAtSize(other, 28)).toBe(other);
  });

  it("does not stack a second suffix onto a URL that already names one", () => {
    expect(photoAtSize(`${SRC}/preview`, 28)).toBe(`${SRC}/preview`);
    expect(photoAtSize(`${SRC}/tiny`, 200)).toBe(`${SRC}/tiny`);
  });
});
