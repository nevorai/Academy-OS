import { useId } from "react";

/**
 * Line artwork for the member-portal panel: a cricket ground seen from above (30-yard circle, pitch, creases,
 * stumps) with a willow bat, a red ball and a white ball dropped on it. Pure SVG, no image request, drawn for
 * a deep turf-green ground. `align` picks which part stays in view when the panel is cropped: the short phone
 * band keeps the top (pitch end, bat, white ball), the tall desktop panel keeps the middle.
 */
export function CricketArt({
  className,
  align = "mid",
}: {
  className?: string;
  align?: "top" | "mid";
}) {
  const uid = useId().replace(/:/g, "");
  const willow = `willow-${uid}`;
  const redBall = `ball-${uid}`;
  const whiteBall = `wball-${uid}`;
  const pitch = `pitch-${uid}`;

  return (
    <svg
      viewBox="0 0 600 760"
      preserveAspectRatio={align === "top" ? "xMidYMin slice" : "xMidYMid slice"}
      className={className}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={willow} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F1D58E" />
          <stop offset="1" stopColor="#C99A45" />
        </linearGradient>
        <radialGradient id={redBall} cx="0.35" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#E0505C" />
          <stop offset="0.6" stopColor="#B3212F" />
          <stop offset="1" stopColor="#6E0F1B" />
        </radialGradient>
        <radialGradient id={whiteBall} cx="0.35" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#CFCBBE" />
        </radialGradient>
        <linearGradient id={pitch} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E6CB93" stopOpacity="0.16" />
          <stop offset="1" stopColor="#E6CB93" stopOpacity="0.08" />
        </linearGradient>
      </defs>

      {/* The ground: boundary rope, 30-yard circle, inner circle. */}
      <circle cx="300" cy="380" r="330" fill="none" stroke="#fff" strokeOpacity="0.08" strokeWidth="2" />
      <circle cx="300" cy="380" r="250" fill="none" stroke="#fff" strokeOpacity="0.12" strokeWidth="2" strokeDasharray="3 11" strokeLinecap="round" />
      <circle cx="300" cy="380" r="120" fill="none" stroke="#fff" strokeOpacity="0.09" strokeWidth="2" />

      {/* The pitch and its creases. */}
      <rect x="262" y="110" width="76" height="540" rx="4" fill={`url(#${pitch})`} stroke="#fff" strokeOpacity="0.14" />
      <g stroke="#fff" strokeLinecap="round" strokeWidth="2">
        <line x1="236" y1="170" x2="364" y2="170" strokeOpacity="0.4" />
        <line x1="236" y1="590" x2="364" y2="590" strokeOpacity="0.4" />
        <line x1="222" y1="192" x2="378" y2="192" strokeOpacity="0.22" />
        <line x1="222" y1="568" x2="378" y2="568" strokeOpacity="0.22" />
        <line x1="250" y1="170" x2="250" y2="192" strokeOpacity="0.22" />
        <line x1="350" y1="170" x2="350" y2="192" strokeOpacity="0.22" />
        <line x1="250" y1="568" x2="250" y2="590" strokeOpacity="0.22" />
        <line x1="350" y1="568" x2="350" y2="590" strokeOpacity="0.22" />
      </g>

      {/* Stumps, seen from above. */}
      <g fill="#F1D58E">
        {[284, 300, 316].map((x) => (
          <circle key={`t${x}`} cx={x} cy="170" r="3.4" />
        ))}
        {[284, 300, 316].map((x) => (
          <circle key={`b${x}`} cx={x} cy="590" r="3.4" />
        ))}
      </g>

      {/* Willow bat. */}
      <g transform="translate(470 268) rotate(34)">
        <rect x="-8" y="-196" width="16" height="84" rx="8" fill="#5A3C22" />
        <g stroke="#2B1A0D" strokeOpacity="0.5" strokeWidth="2">
          <line x1="-8" y1="-176" x2="8" y2="-176" />
          <line x1="-8" y1="-162" x2="8" y2="-162" />
          <line x1="-8" y1="-148" x2="8" y2="-148" />
        </g>
        <rect x="-28" y="-118" width="56" height="156" rx="12" fill={`url(#${willow})`} />
        <line x1="0" y1="-104" x2="0" y2="24" stroke="#6B4A1F" strokeOpacity="0.28" strokeWidth="2" />
        <rect x="-28" y="-118" width="56" height="156" rx="12" fill="none" stroke="#fff" strokeOpacity="0.35" />
      </g>

      {/* Red ball with its seam. */}
      <g transform="translate(468 540)">
        <circle r="36" fill={`url(#${redBall})`} />
        <path d="M-27 -22 C-8 -10 -8 10 -27 22" fill="none" stroke="#F4E3D3" strokeOpacity="0.85" strokeWidth="2" strokeDasharray="2.5 3.5" strokeLinecap="round" />
        <path d="M27 -22 C8 -10 8 10 27 22" fill="none" stroke="#F4E3D3" strokeOpacity="0.85" strokeWidth="2" strokeDasharray="2.5 3.5" strokeLinecap="round" />
      </g>

      {/* White ball. */}
      <g transform="translate(124 232)">
        <circle r="22" fill={`url(#${whiteBall})`} />
        <path d="M-16 -12 C-5 -5 -5 5 -16 12" fill="none" stroke="#9A1B27" strokeOpacity="0.55" strokeWidth="1.6" strokeDasharray="2 3" strokeLinecap="round" />
        <path d="M16 -12 C5 -5 5 5 16 12" fill="none" stroke="#9A1B27" strokeOpacity="0.55" strokeWidth="1.6" strokeDasharray="2 3" strokeLinecap="round" />
      </g>
    </svg>
  );
}
