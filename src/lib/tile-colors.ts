/** Colours for home and Manage tiles, so every button is easy to tell apart at a glance. */
const PALETTE = [
  "#16a34a", // green
  "#2563eb", // blue
  "#f59e0b", // amber
  "#e11d48", // rose
  "#7c3aed", // violet
  "#ea580c", // orange
  "#0d9488", // teal
  "#4f46e5", // indigo
  "#db2777", // pink
  "#65a30d", // lime
  "#0891b2", // cyan
];

export function tileColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}

/** Inline styles for a tile card and its icon chip, tinted with one colour. */
export function tileStyles(color: string) {
  return {
    card: {
      backgroundColor: `color-mix(in oklab, ${color} 9%, var(--card, white))`,
      borderColor: `color-mix(in oklab, ${color} 30%, transparent)`,
    } as React.CSSProperties,
    chip: {
      backgroundColor: color,
      color: "#fff",
      boxShadow: `0 4px 10px -3px color-mix(in oklab, ${color} 55%, transparent)`,
    } as React.CSSProperties,
  };
}
