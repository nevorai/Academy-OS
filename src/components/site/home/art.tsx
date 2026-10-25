/**
 * Cricket artwork for the academy's public home page. Everything is inline SVG that takes its
 * colours from the page (currentColor and the academy's --brand), so it costs no request and
 * follows each academy's colour.
 */

/** Six dots, like the six balls of an over: `filled` of them are lit. Marks the section order. */
export function OverDots({
  filled = 1,
  total = 6,
  onBrand = false,
  className = "",
}: {
  filled?: number;
  total?: number;
  /** On a band in the academy's own colour, lit dots are white. */
  onBrand?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${i < filled ? (onBrand ? "bg-white" : "bg-[var(--brand)]") : "bg-current opacity-30"}`}
        />
      ))}
    </span>
  );
}

/** A red cricket ball with its stitched seam. */
export function BallMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="#B8322A" />
      <circle cx="24" cy="24" r="22" fill="none" stroke="#00000033" strokeWidth="1.5" />
      <path
        d="M9 10c9 5 9 23 0 28M39 10c-9 5-9 23 0 28"
        fill="none"
        stroke="#F4E9D8"
        strokeWidth="1.6"
      />
      <path
        d="M11.5 14l3 1.5M12.6 19.2l3.3.7M13 24.2h3.4M12.6 29.2l3.3-.7M11.5 34l3-1.5M36.5 14l-3 1.5M35.4 19.2l-3.3.7M35 24.2h-3.4M35.4 29.2l-3.3-.7M36.5 34l-3-1.5"
        stroke="#F4E9D8"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Faint ground plan for the hero: boundary rope, 30-yard circle and a pitch with its creases,
 * drawn in white on the dark hero and anchored to the lower right.
 */
export function HeroGround({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1440 800"
      preserveAspectRatio="xMaxYMax slice"
      className={className}
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <circle cx="1130" cy="610" r="560" strokeWidth="2" opacity=".5" />
      <circle cx="1130" cy="610" r="330" strokeWidth="2" strokeDasharray="6 12" opacity=".45" />
      <g transform="rotate(-14 1130 610)">
        <rect x="1096" y="430" width="68" height="360" strokeWidth="2" opacity=".6" />
        <path d="M1078 468h104M1078 752h104" strokeWidth="2" opacity=".6" />
        <path
          d="M1114 446v-14M1130 446v-14M1146 446v-14M1114 774v14M1130 774v14M1146 774v14"
          strokeWidth="3"
          strokeLinecap="round"
          opacity=".7"
        />
      </g>
    </svg>
  );
}

/** Top view of a cricket ground: a shot to the boundary, fielders and the pitch in the middle. */
export function PitchPlan({ className = "" }: { className?: string }) {
  const fielders: Array<[number, number]> = [
    [180, 78],
    [262, 112],
    [296, 196],
    [268, 286],
    [180, 340],
    [92, 286],
    [64, 196],
    [98, 112],
  ];
  return (
    <svg
      viewBox="0 0 360 420"
      className={className}
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <circle cx="180" cy="210" r="168" strokeWidth="2" />
      <circle cx="180" cy="210" r="104" strokeWidth="1.5" strokeDasharray="5 8" opacity=".7" />
      <rect
        x="163"
        y="136"
        width="34"
        height="148"
        strokeWidth="1.8"
        fill="var(--brand)"
        fillOpacity=".12"
      />
      <path d="M150 156h60M150 264h60" strokeWidth="1.8" />
      <path
        d="M172 146v-9M180 146v-9M188 146v-9M172 274v9M180 274v9M188 274v9"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M182 262C232 240 286 190 318 96"
        strokeWidth="2.4"
        strokeDasharray="2 8"
        strokeLinecap="round"
        stroke="var(--brand)"
      />
      <path
        d="M308 100l10-6 2 12"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="var(--brand)"
      />
      {fielders.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="6" strokeWidth="2" fill="currentColor" fillOpacity=".12" />
      ))}
      <circle cx="180" cy="152" r="5" fill="#B8322A" stroke="none" />
    </svg>
  );
}

/** Wagon wheel: where the runs went, as rays from the pitch to the rope. */
export function WagonWheel({ className = "" }: { className?: string }) {
  const rays: Array<[number, number, boolean]> = [
    [-70, 0.55, false],
    [-48, 0.95, true],
    [-30, 0.7, false],
    [-12, 0.9, true],
    [8, 0.5, false],
    [24, 0.85, true],
    [44, 0.6, false],
    [64, 0.95, true],
    [96, 0.45, false],
    [126, 0.7, false],
    [152, 0.9, true],
    [176, 0.55, false],
    [-100, 0.6, false],
    [-130, 0.82, true],
    [-154, 0.5, false],
  ];
  const R = 150;
  return (
    <svg
      viewBox="0 0 340 340"
      className={className}
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <circle cx="170" cy="170" r={R} strokeWidth="2" />
      <circle cx="170" cy="170" r="88" strokeWidth="1.2" strokeDasharray="4 7" opacity=".6" />
      {rays.map(([deg, len, four], i) => {
        const a = (deg * Math.PI) / 180;
        const x = 170 + Math.sin(a) * R * len;
        const y = 170 - Math.cos(a) * R * len;
        return (
          <line
            key={i}
            x1="170"
            y1="170"
            x2={x.toFixed(1)}
            y2={y.toFixed(1)}
            strokeWidth={four ? 3 : 1.6}
            strokeLinecap="round"
            opacity={four ? 1 : 0.55}
          />
        );
      })}
      <rect
        x="164"
        y="152"
        width="12"
        height="36"
        rx="2"
        fill="currentColor"
        fillOpacity=".25"
        strokeWidth="1.4"
      />
    </svg>
  );
}

/** One over, ball by ball, drawn as the little chips of a scorecard. */
export function OverStrip({ className = "" }: { className?: string }) {
  const balls = ["1", "4", "•", "W", "6", "2"];
  return (
    <div className={`flex items-center gap-2 ${className}`} aria-hidden="true">
      {balls.map((b, i) => (
        <span
          key={i}
          className={`grid h-9 w-9 place-items-center rounded-full border text-sm font-bold ${
            b === "W"
              ? "border-[#B8322A] bg-[#B8322A] text-white"
              : b === "4" || b === "6"
                ? "border-white bg-white text-[var(--brand)]"
                : "border-white/40 text-white"
          }`}
        >
          {b}
        </span>
      ))}
    </div>
  );
}

export type PillarIconKind = "bat" | "ball" | "catch" | "timer";

/** Line icons for the four things a cricket academy teaches. */
export function PillarIcon({ kind, className = "" }: { kind: PillarIconKind; className?: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" {...common}>
      {kind === "bat" ? (
        <>
          <g transform="rotate(42 24 24)">
            <rect x="19" y="3" width="10" height="27" rx="4" />
            <rect x="22.5" y="30" width="3" height="13" rx="1.5" />
          </g>
          <circle cx="37" cy="38" r="4.5" />
        </>
      ) : null}
      {kind === "ball" ? (
        <>
          <circle cx="14" cy="13" r="6" />
          <path d="M9 11c3 1 4 5 2 8" />
          <path d="M21 17c8 2 12 8 14 14" strokeDasharray="1 5" />
          <path d="M33 28v14M38 28v14M43 28v14M32 30h12" />
        </>
      ) : null}
      {kind === "catch" ? (
        <>
          <circle cx="24" cy="13" r="5" />
          <path d="M7 27c4 12 30 12 34 0" />
          <path d="M7 27l-2-9M41 27l2-9M14 33l-3 6M34 33l3 6" />
        </>
      ) : null}
      {kind === "timer" ? (
        <>
          <circle cx="24" cy="28" r="14" />
          <path d="M20 5h8M24 5v9M24 28V19M24 28l6 4M38 13l3 3" />
        </>
      ) : null}
    </svg>
  );
}

/** A stitched line to separate things, like the seam of the ball. */
export function SeamLine({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 8" preserveAspectRatio="none" className={className} aria-hidden="true">
      <path
        d="M0 4h400"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="10 8"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
