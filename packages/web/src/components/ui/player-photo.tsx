import { useEffect, useState } from "react";
import { User } from "lucide-react";
import { cn } from "../../lib/utils";
import { photoAtSize } from "../../lib/photo";

/**
 * A player portrait, hotlinked from the dataset's source CDN.
 *
 * Two things this component exists to handle:
 *
 * 1. **Most players have no photo.** The dataset only carries one where the
 *    enrichment pass matched, so the fallback is the common case, not the error
 *    case — one shared silhouette, styled like `Crest`'s code box.
 * 2. **The full asset is 700×700 and 123 KB.** `photoAtSize` picks the smallest
 *    rendition that still covers the slot — see `lib/photo.ts` for the measured
 *    numbers.
 */

export function PlayerPhoto({
  src,
  alt,
  size = 32,
  className,
}: {
  src?: string;
  alt?: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  // A recycled row (virtualised list, re-sorted table) must not inherit the
  // previous player's failure.
  useEffect(() => setFailed(false), [src]);

  const shell = "inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2";

  if (!src || failed) {
    return (
      <span className={cn(shell, "text-fg-muted", className)} style={{ width: size, height: size }} aria-hidden>
        <User strokeWidth={1.75} style={{ width: size * 0.6, height: size * 0.6 }} />
      </span>
    );
  }

  return (
    <span className={cn(shell, className)} style={{ width: size, height: size }}>
      <img
        src={photoAtSize(src, size)}
        alt={alt ?? ""}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />
    </span>
  );
}
