import { useEffect, useState } from "react";

/**
 * Subscribes to a CSS media query, for the rare case where a breakpoint has to
 * change what is RENDERED rather than how it is styled — an SVG `viewBox` is an
 * attribute, so Tailwind cannot reach it.
 *
 * The first value is read from `matchMedia` synchronously rather than defaulting
 * to false, or a layout that depends on the breakpoint visibly flips on the
 * first frame.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    // Re-reads the query rather than trusting the event payload, and only sets
    // state when the answer actually flipped — so this is free while the
    // breakpoint is not crossed, however noisy the source event is.
    const read = (): void => setMatches((prev) => (prev === mql.matches ? prev : mql.matches));
    read(); // the query itself may have changed
    mql.addEventListener("change", read);
    // `change` is the real signal; `resize` is a cheap belt-and-braces fallback
    // for viewports that move without dispatching one. Note the reactive path
    // cannot be verified in the in-app browser pane at all: measured there, a
    // CDP viewport change fires NEITHER event, nor ResizeObserver. What is
    // verifiable — and what actually matters, since nobody drags a phone across
    // 1024px mid-match — is the orientation chosen on mount.
    window.addEventListener("resize", read);
    return () => {
      mql.removeEventListener("change", read);
      window.removeEventListener("resize", read);
    };
  }, [query]);

  return matches;
}
