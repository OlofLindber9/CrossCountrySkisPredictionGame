export function format(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function disciplineColor(discipline: string): string {
  const d = discipline.toLowerCase();
  if (d.includes("sprint")) return "badge-yellow";
  if (d.includes("relay")) return "badge-red";
  if (d.includes("skiathlon") || d.includes("pursuit")) return "badge-green";
  if (d.includes("mass start")) return "badge-purple";
  return "badge-blue"; // interval start and other distance races
}

/**
 * Returns the short distance label shown on race cards.
 * "Sprint Final" → "Sprint", "Interval Start 10km" → "10km",
 * "Mass Start 20km" → "20km", "Skiathlon 7.5+7.5km" → "7.5+7.5km"
 */
export function distanceLabel(discipline: string): string {
  if (/sprint/i.test(discipline)) return "Sprint";
  // Extract the km portion (handles "10km", "7.5+7.5km", "20 km", etc.)
  const m = discipline.match(/\d+(?:[.,]\d+)?(?:\s*\+\s*\d+(?:[.,]\d+)?)?\s*km/i);
  if (m) return m[0].replace(/\s+/g, "").replace(",", ".");
  // Fallback for types without a distance attached
  if (/skiathlon/i.test(discipline)) return "Skiathlon";
  if (/pursuit/i.test(discipline)) return "Pursuit";
  if (/mass start/i.test(discipline)) return "Mass Start";
  return discipline;
}

export function techniqueColor(technique: string): string {
  const t = technique.toLowerCase();
  if (t === "classic") return "badge-purple";
  if (t === "free") return "badge-green";
  return "badge-gray";
}

export function genderLabel(gender: string): string {
  return gender === "W" ? "Women" : "Men";
}

export function genderColor(gender: string): string {
  return gender === "W" ? "badge-rose" : "badge-teal";
}

/**
 * Human-readable technique label for badge display.
 * Skiathlon is inherently both techniques, so it shows "Classic/Free".
 */
export function techniqueLabel(technique: string | null | undefined): string {
  if (!technique) return "—";
  if (technique === "Skiathlon") return "Both";
  return technique;
}

/** FIS Cross-Country WC points per finishing position (1st–30th). */
const WC_POINTS_TABLE = [
  100, 80, 60, 50, 45, 40, 36, 32, 29, 26,
   24, 22, 20, 18, 16, 15, 14, 13, 12, 11,
   10,  9,  8,  7,  6,  5,  4,  3,  2,  1,
];

export function wcPoints(rank: number | null): number {
  if (!rank || rank < 1 || rank > 30) return 0;
  return WC_POINTS_TABLE[rank - 1];
}
