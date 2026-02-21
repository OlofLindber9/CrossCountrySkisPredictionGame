/**
 * FIS data fetcher
 *
 * Calendar:  data.fis-ski.com/fis_events/ajax/calendarfunctions/load_calendar.html
 * Results:   data.fis-ski.com/fis_events/ajax/raceresultsfunctions/details.html
 *
 * Both return HTML that we parse with cheerio.
 */
import * as cheerio from "cheerio";
import { wcPoints } from "@/lib/utils";

const BASE = "https://data.fis-ski.com";

export interface FisRace {
  id: string;
  name: string;
  venue: string;
  country: string;
  date: Date;
  discipline: string;
  gender: string;
  season: string;
}

export interface FisResult {
  athleteId: string;
  athleteName: string;
  nationCode: string;
  rank: number | null;
}

/** Fetch World Cup cross-country calendar for a given season (e.g. "2026") */
export async function fetchCalendar(seasonCode: string): Promise<FisRace[]> {
  const url =
    `${BASE}/fis_events/ajax/calendarfunctions/load_calendar.html` +
    `?sectorcode=CC&seasoncode=${seasonCode}&categorycode=WC`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SkiPredictor/1.0)" },
    next: { revalidate: 3600 },
  });

  if (!res.ok) throw new Error(`FIS calendar fetch failed: ${res.status}`);
  const html = await res.text();
  return parseCalendar(html, seasonCode);
}

/** Fetch results for a race by its FIS race ID */
export async function fetchResults(raceId: string): Promise<FisResult[]> {
  const url =
    `${BASE}/fis_events/ajax/raceresultsfunctions/details.html` +
    `?sectorcode=CC&raceid=${raceId}&competitors=`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SkiPredictor/1.0)" },
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`FIS results fetch failed: ${res.status}`);
  const html = await res.text();
  return parseResults(html);
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function parseCalendar(html: string, seasonCode: string): FisRace[] {
  const $ = cheerio.load(html);
  const races: FisRace[] = [];
  const season = `${parseInt(seasonCode) - 1}-${seasonCode}`;

  // The FIS calendar HTML wraps each event weekend in:
  //   <div class="table-row reset-padding" data-navstart="28" data-navend="30"
  //        data-navmonth="11" id="58060">
  // The id is the FIS event ID. We create one Race entry per gender per event.
  $("div.table-row.reset-padding[id]").each((_, el) => {
    const eventId = $(el).attr("id");
    if (!eventId || !/^\d+$/.test(eventId)) return;

    // --- Date ---
    // Extract year from the date link text, e.g. "28-30 Nov 2025"
    const dateLinkText = $(el).find("a[href*='eventid=']").first().text().trim();
    const navMonth = parseInt($(el).attr("data-navmonth") || "1");
    const navStart = parseInt($(el).attr("data-navstart") || "1");
    const yearMatch = dateLinkText.match(/\b(20\d\d)\b/);
    const year = yearMatch ? parseInt(yearMatch[1]) : parseInt(seasonCode);
    const date = new Date(year, navMonth - 1, navStart);

    // --- Venue ---
    // The venue name appears in several responsive variants; grab first non-empty text
    let venue = "";
    $(el).find(".clip-xs").each((_, v) => {
      const t = $(v).text().trim();
      if (t && !venue) venue = t;
    });
    if (!venue) {
      $(el).find(".font_md_large, .font_lg_large").each((_, v) => {
        const t = $(v).text().trim();
        if (t && !venue) venue = t;
      });
    }

    // --- Country ---
    const country = $(el).find(".country__name-short").first().text().trim();

    // --- Disciplines ---
    // The split-row items contain e.g. "WC • SPWQ" and "2x10k 4xSP 2x30k"
    const splitItems: string[] = [];
    $(el).find(".split-row__item .clip").each((_, v) => {
      const t = $(v).text().trim();
      if (t) splitItems.push(t);
    });
    // Second item is the race formats; first is the category codes
    const disciplineRaw = splitItems[1] || splitItems[0] || "";
    const discipline = extractDisciplineFromText(disciplineRaw);

    // --- Genders ---
    const hasW = $(el).find(".gender__item_l").length > 0;
    const hasM = $(el).find(".gender__item_m").length > 0;

    if (hasW) {
      races.push({
        id: `${eventId}-W`,
        name: `Women ${discipline} - ${venue}`,
        venue,
        country,
        date,
        discipline,
        gender: "W",
        season,
      });
    }
    if (hasM) {
      races.push({
        id: `${eventId}-M`,
        name: `Men ${discipline} - ${venue}`,
        venue,
        country,
        date,
        discipline,
        gender: "M",
        season,
      });
    }
  });

  return races;
}

function parseResults(html: string): FisResult[] {
  const $ = cheerio.load(html);

  // The details.html endpoint embeds a JSON array in a script tag or a hidden input
  // Format: [{"Competitorid":"189450","Competitorname":"...","Nationcode":"FIN","Position":"1"}, ...]
  const results: FisResult[] = [];

  // Try to find the JSON array in script tags
  $("script").each((_, el) => {
    const text = $(el).html() || "";
    const match = text.match(/\[\s*\{"Competitorid"[\s\S]*?\}\s*\]/);
    if (match) {
      try {
        const data = JSON.parse(match[0]) as Array<{
          Competitorid: string;
          Competitorname: string;
          Nationcode: string;
          Position: string | null;
        }>;
        data.forEach((item) => {
          results.push({
            athleteId: item.Competitorid,
            athleteName: item.Competitorname,
            nationCode: item.Nationcode,
            rank: item.Position ? parseInt(item.Position) : null,
          });
        });
      } catch {
        // ignore parse errors
      }
    }
  });

  // Fallback: parse hidden inputs that may hold competitor JSON
  if (results.length === 0) {
    $("input[type=hidden]").each((_, el) => {
      const val = $(el).attr("value") || "";
      if (!val.startsWith("[")) return;
      try {
        const data = JSON.parse(val) as Array<{
          Competitorid: string;
          Competitorname: string;
          Nationcode: string;
          Position: string | null;
        }>;
        data.forEach((item) => {
          results.push({
            athleteId: item.Competitorid,
            athleteName: item.Competitorname,
            nationCode: item.Nationcode,
            rank: item.Position ? parseInt(item.Position) : null,
          });
        });
      } catch {
        // ignore
      }
    });
  }

  // Second fallback: look for raw JSON text anywhere in the document
  if (results.length === 0) {
    const bodyText = $.html();
    const match = bodyText.match(/\[\s*\{"Competitorid"[\s\S]*?\}\s*\]/);
    if (match) {
      try {
        const data = JSON.parse(match[0]) as Array<{
          Competitorid: string;
          Competitorname: string;
          Nationcode: string;
          Position: string | null;
        }>;
        data.forEach((item) => {
          results.push({
            athleteId: item.Competitorid,
            athleteName: item.Competitorname,
            nationCode: item.Nationcode,
            rank: item.Position ? parseInt(item.Position) : null,
          });
        });
      } catch {
        // ignore
      }
    }
  }

  return results.sort((a, b) => {
    if (a.rank === null) return 1;
    if (b.rank === null) return -1;
    return a.rank - b.rank;
  });
}

// ---------------------------------------------------------------------------
// Athlete pool (for prediction forms on upcoming races)
// ---------------------------------------------------------------------------

/**
 * Confirmed individual WC race IDs for the 2025-26 season, by gender.
 * Sorted roughly chronologically. Relay/team-sprint IDs are excluded since
 * they don't map cleanly to individual athletes.
 * Update this list as more races are completed each season.
 */
const WC_SEASON_RACES: Record<string, string[]> = {
  M: [
    // Ruka (Nov 28-30)
    "49463", "49465", "49467",
    // Lillehammer (Dec 6-8)
    "49477", "49479",
    // Davos (Dec 13-15)
    "49489", "49491",
    // Toblach / Tour de Ski (Dec 27 – Jan 5)
    "49541", "49547", "49549",
  ],
  W: [
    // Ruka (Nov 28-30)
    "49464", "49466", "49468",
    // Lillehammer (Dec 6-8)
    "49478",
    // Davos (Dec 13-15)
    "49490",
    // Toblach / Tour de Ski (Dec 27 – Jan 5)
    "49542", "49548",
    // Goms (Jan 23)
    "49500",
  ],
};

/**
 * Fetch the athlete pool for a given gender, sorted by accumulated WC points
 * across all confirmed season races (best approximation of WC standings).
 * Each individual FIS fetch is cached for 24 h by Next.js so repeat loads
 * are served instantly from the cache.
 */
export async function fetchAthletePool(
  gender: string
): Promise<{ id: string; name: string; nationCode: string }[]> {
  const raceIds = WC_SEASON_RACES[gender] ?? [];
  const points = new Map<string, number>();
  const athleteData = new Map<string, { name: string; nationCode: string }>();

  for (const fisRaceId of raceIds) {
    try {
      const url =
        `${BASE}/fis_events/ajax/raceresultsfunctions/details.html` +
        `?sectorcode=CC&raceid=${fisRaceId}&competitors=`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SkiPredictor/1.0)" },
        cache: "no-store", // FIS HTML is 2-5 MB — too large for Next.js fetch cache
      });
      if (!res.ok) continue;
      const html = await res.text();
      const results = parseResults(html);
      for (const r of results) {
        athleteData.set(r.athleteId, { name: r.athleteName, nationCode: r.nationCode });
        points.set(r.athleteId, (points.get(r.athleteId) ?? 0) + wcPoints(r.rank));
      }
    } catch {
      // Ignore individual race failures
    }
  }

  // Sort by accumulated WC points descending; alphabetical as tiebreaker
  return Array.from(athleteData.entries())
    .map(([id, { name, nationCode }]) => ({ id, name, nationCode, pts: points.get(id) ?? 0 }))
    .sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name))
    .map(({ id, name, nationCode }) => ({ id, name, nationCode }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractDisciplineFromText(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("sprint")) return "Sprint";
  if (t.includes("skiathlon")) return "Skiathlon";
  if (t.includes("pursuit")) return "Pursuit";
  if (t.includes("relay")) return "Relay";
  if (t.includes("50")) return "Distance 50k";
  if (t.includes("30")) return "Distance 30k";
  if (t.includes("15")) return "Distance 15k";
  if (t.includes("10")) return "Distance 10k";
  return "Distance";
}

function parseFisDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  // Try ISO format first
  const iso = new Date(dateStr);
  if (!isNaN(iso.getTime())) return iso;

  // FIS often uses "28 Nov 2025" or "28-30 Nov 2025" format
  const monthMap: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  // Range like "28-30 Nov 2025" — take first day
  const rangeMatch = dateStr.match(/(\d{1,2})[-–]\d{1,2}\s+(\w{3})\s+(\d{4})/i);
  if (rangeMatch) {
    const [, day, mon, year] = rangeMatch;
    const m = monthMap[mon.toLowerCase()];
    if (m !== undefined) return new Date(parseInt(year), m, parseInt(day));
  }

  // Single date like "28 Nov 2025"
  const singleMatch = dateStr.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})/i);
  if (singleMatch) {
    const [, day, mon, year] = singleMatch;
    const m = monthMap[mon.toLowerCase()];
    if (m !== undefined) return new Date(parseInt(year), m, parseInt(day));
  }

  return null;
}
