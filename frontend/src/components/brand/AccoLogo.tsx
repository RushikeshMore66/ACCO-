import Image from "next/image";
import { clsx } from "clsx";

interface AccoLogoProps {
  /** Visual size of the logo */
  size?: "icon" | "sm" | "md" | "lg";
  /** Show only the mark (icon) without the wordmark */
  markOnly?: boolean;
  className?: string;
}

const sizeMap = {
  icon: { width: 32, height: 32 },
  sm: { width: 100, height: 36 },
  md: { width: 130, height: 46 },
  lg: { width: 180, height: 64 },
};

/**
 * AccoLogo renders the original ACCO brand PNG at the correct proportions.
 *
 * The logo PNG has a white background, so it is displayed inside a
 * white-pill container when the parent background is dark (e.g. sidebar).
 * Pass `className` to adjust sizing or positioning.
 *
 * Do NOT crop, recolor, or redraw this asset.
 */
export function AccoLogo({
  size = "md",
  markOnly = false,
  className,
}: AccoLogoProps) {
  const dims = sizeMap[markOnly ? "icon" : size];

  return (
    <div
      className={clsx(
        "inline-flex items-center justify-center shrink-0",
        // White background pill so the logo reads on dark/colored parents
        "bg-white rounded-lg",
        className
      )}
      style={{ width: dims.width, height: dims.height }}
    >
      <Image
        src="/assets/acco-logo.png"
        alt="ACCO — AI Accounts Receivable & Collections"
        width={dims.width}
        height={dims.height}
        priority
        style={{
          objectFit: "contain",
          width: "100%",
          height: "100%",
        }}
      />
    </div>
  );
}
