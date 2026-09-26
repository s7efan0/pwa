import { cn } from "@/lib/utils";

/** Breathing room between the crest and the edge of its chip. */
const CHIP_PADDING = 2;

/**
 * Team crests come from a CDN in every conceivable palette, and plenty are
 * dark line art that disappears against a dark surface. A constant light
 * backdrop keeps every crest legible in both themes — it is near-invisible
 * on the light card and does the work in dark mode.
 *
 * `size` is the size of the CREST; the chip grows around it. Sizing the chip
 * instead would silently shrink the artwork, which at these dimensions is the
 * difference between a readable badge and a smudge.
 *
 * Also centralises the CDN-404 handling that was duplicated across three
 * pages: a dead URL must not leave a broken-image glyph.
 */
export function TeamBadge({
  url,
  size = 20,
  className,
  eager = false,
}: {
  url: string | null;
  size?: number;
  className?: string;
  /** For badges that are always on screen — lazy only delays those. */
  eager?: boolean;
}) {
  const chip = size + CHIP_PADDING * 2;

  if (!url) {
    return (
      <span
        aria-hidden="true"
        className={cn("shrink-0", className)}
        style={{ width: chip, height: chip }}
      />
    );
  }

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-white/95",
        className,
      )}
      style={{ width: chip, height: chip }}
    >
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className="object-contain"
        style={{ width: size, height: size }}
        onError={(e) => {
          e.currentTarget.parentElement?.style.setProperty(
            "visibility",
            "hidden",
          );
        }}
      />
    </span>
  );
}
