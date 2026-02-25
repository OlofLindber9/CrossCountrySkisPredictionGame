/**
 * FIS data fetcher
 *
 * Calendar:  data.fis-ski.com/fis_events/ajax/calendarfunctions/load_calendar.html
 * Results:   data.fis-ski.com/fis_events/ajax/raceresultsfunctions/details.html
 * Event:     www.fis-ski.com/DB/general/event-details.html  (individual race IDs)
 *
 * Calendar returns one entry per event weekend (venue, date, country).
 * Event detail page lists every individual race with its raceid, discipline, and technique.
 * Results returns HTML with embedded JSON from data.fis-ski.com (AJAX endpoint).
 */
import * as cheerio from "cheerio";
import { wcPoints } from "@/lib/utils";

const BASE = "https://data.fis-ski.com";

/** Calendar-level event (one per event weekend, used to carry venue/date into individual races) */
export interface FisRace {
  id: string;       // "{eventId}-{gender}" — placeholder used by fetchAthletePool
  eventId: string;  // FIS event ID
  name: string;
  venue: string;
  country: string;
  date: Date;
  discipline: string;
  technique: string;
  gender: string;
  season: string;
}

/** One individual race from the FIS event detail page */
export interface FisEventRace {
  fisRaceId: string;
  discipline: string;
  technique: string;
  gender: "M" | "W";
  date?: Date; // individual race date when parseable from the event detail page
}

export interface FisResult {
  athleteId: string;
  athleteName: string;
  nationCode: string;
  rank: number | null;
}

export interface FisStanding {
  athleteId: string;
  athleteName: string;
  nationCode: string;
  points: number;
  gender: string;
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

/**
 * Fetch individual races for a FIS event weekend from the event detail page.
 * Returns one entry per individual race (not per event or per gender).
 * Qualification races are excluded.
 */
export async function fetchEventRaces(
  eventId: string,
  seasonCode: string,
  eventStartDate?: Date
): Promise<FisEventRace[]> {
  const url =
    `https://www.fis-ski.com/DB/general/event-details.html` +
    `?sectorcode=CC&eventid=${eventId}&seasoncode=${seasonCode}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SkiPredictor/1.0)" },
    next: { revalidate: 3600 },
  });

  if (!res.ok) return [];
  const html = await res.text();
  return parseEventRaces(html, eventStartDate);
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

/**
 * Parse individual races from a FIS event detail page.
 *
 * Each race row in #eventdetailscontent contains:
 *   - a link with href "...?raceid=XXXXX"  → the FIS race ID
 *   - .gender__item_l                       → Women's race
 *   - .gender__item_m                       → Men's race
 *   - text describing race type and technique
 *
 * Qualification, relay, and team-sprint rows are excluded.
 */
function parseEventRaces(html: string, eventStartDate?: Date): FisEventRace[] {
  const $ = cheerio.load(html);
  const races: FisEventRace[] = [];

  $("#eventdetailscontent .table-row").each((_, row) => {
    const $row = $(row);

    // Extract FIS race ID from the result link
    const href = $row.find("a[href*='raceid=']").first().attr("href") || "";
    const match = href.match(/[?&]raceid=(\d+)/);
    if (!match) return;
    const fisRaceId = match[1];

    // Skip if we've already added this race ID
    if (races.some((r) => r.fisRaceId === fisRaceId)) return;

    const rowText = $row.text();

    // Exclude qualification, relay, and team-sprint races
    // "qualif" catches "Qualification"/"Qualifier"; "qual" catches FIS abbreviation "Qual"; "SPQ" is the FIS codex abbreviation
    if (/qualif|\bqual\b|\bspq\b/i.test(rowText)) return;
    if (/relay/i.test(rowText)) return;
    if (/team\s*sprint/i.test(rowText)) return;

    // Gender: ladies (.gender__item_l) = Women, men (.gender__item_m) = Men
    const isW = $row.find(".gender__item_l").length > 0;
    const isM = $row.find(".gender__item_m").length > 0;
    if (!isW && !isM) return;

    const discipline = extractDisciplineFromRow(rowText);
    const technique = extractTechnique(rowText, discipline);
    const gender: "M" | "W" = isW ? "W" : "M";

    // Try to extract the individual race date from this row (e.g. "01 MAR", "28 FEB")
    const date = eventStartDate
      ? parseRaceDateFromRowText(rowText, eventStartDate) ?? undefined
      : undefined;

    races.push({ fisRaceId, discipline, technique, gender, date });
  });

  return races;
}

/**
 * Try to parse a specific race date from the row text on the event detail page.
 * FIS rows contain dates like "01 MAR", "28 FEB", "1 March" etc.
 * Returns null if no recognisable date is found.
 */
function parseRaceDateFromRowText(rowText: string, eventStart: Date): Date | null {
  const MONTHS: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  const m = rowText.match(
    /\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/i
  );
  if (!m) return null;

  const day = parseInt(m[1]);
  const monthKey = m[2].toLowerCase().substring(0, 3) as keyof typeof MONTHS;
  const month = MONTHS[monthKey];
  if (month === undefined || day < 1 || day > 31) return null;

  // Use the same year as the event start. Allow the race to fall up to 10 days
  // after the event start date (a long event weekend). If the result is wildly
  // off, try adjusting the year (handles rare Dec→Jan crossover events).
  const eventYear = eventStart.getFullYear();
  const candidate = new Date(eventYear, month, day);
  const diffDays = (candidate.getTime() - eventStart.getTime()) / 86400000;

  if (diffDays >= -1 && diffDays <= 10) return candidate;

  // Try next year (Dec event, Jan race)
  const nextYear = new Date(eventYear + 1, month, day);
  const diffNext = (nextYear.getTime() - eventStart.getTime()) / 86400000;
  if (diffNext >= -1 && diffNext <= 10) return nextYear;

  return null;
}

function parseCalendar(html: string, seasonCode: string): FisRace[] {
  const $ = cheerio.load(html);
  const races: FisRace[] = [];
  const season = `${parseInt(seasonCode) - 1}-${seasonCode}`;

  // Each event weekend is wrapped in:
  //   <div class="table-row reset-padding" data-navstart="28" data-navend="30"
  //        data-navmonth="11" id="58060">
  $("div.table-row.reset-padding[id]").each((_, el) => {
    const eventId = $(el).attr("id");
    if (!eventId || !/^\d+$/.test(eventId)) return;

    // --- Date ---
    const dateLinkText = $(el).find("a[href*='eventid=']").first().text().trim();
    const navMonth = parseInt($(el).attr("data-navmonth") || "1");
    const navStart = parseInt($(el).attr("data-navstart") || "1");
    const yearMatch = dateLinkText.match(/\b(20\d\d)\b/);
    const year = yearMatch
      ? parseInt(yearMatch[1])
      : navMonth >= 9
        ? parseInt(seasonCode) - 1
        : parseInt(seasonCode);
    const date = new Date(year, navMonth - 1, navStart);

    // --- Venue ---
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

    // --- Genders ---
    const hasW = $(el).find(".gender__item_l").length > 0;
    const hasM = $(el).find(".gender__item_m").length > 0;

    // Create one placeholder per gender so fetchAthletePool can get eventIds by gender
    if (hasW) {
      races.push({
        id: `${eventId}-W`,
        eventId,
        name: `Women - ${venue}`,
        venue,
        country,
        date,
        discipline: "",
        technique: "",
        gender: "W",
        season,
      });
    }
    if (hasM) {
      races.push({
        id: `${eventId}-M`,
        eventId,
        name: `Men - ${venue}`,
        venue,
        country,
        date,
        discipline: "",
        technique: "",
        gender: "M",
        season,
      });
    }
  });

  return races;
}

function parseResults(html: string): FisResult[] {
  const $ = cheerio.load(html);

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
// WC Standings
// ---------------------------------------------------------------------------

/**
 * Fetch the current overall FIS World Cup standings for a given gender.
 */
export async function fetchWcStandings(
  gender: string,
  seasonCode: string
): Promise<FisStanding[]> {
  const genderCode = gender === "M" ? "M" : "W";
  const url =
    `https://www.fis-ski.com/DB/general/cup-standings.html` +
    `?sectorcode=CC&seasoncode=${seasonCode}&cupcode=WC&disciplinecode=ALL` +
    `&gendercode=${genderCode}&mi=menu-cup-standings`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SkiPredictor/1.0)" },
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`FIS standings fetch failed: ${res.status}`);
  const html = await res.text();
  return parseWcStandings(html, gender);
}

function parseWcStandings(html: string, gender: string): FisStanding[] {
  const $ = cheerio.load(html);
  const standings: FisStanding[] = [];
  const seen = new Set<string>();

  $(".table-row").each((_, row) => {
    const $row = $(row);
    const $link = $row.find("a[href*='competitorid=']").first();
    if ($link.length === 0) return;

    const href = $link.attr("href") || "";
    const idMatch = href.match(/[?&]competitorid=(\d+)/);
    if (!idMatch) return;

    const athleteId = idMatch[1];
    if (seen.has(athleteId)) return;

    const name = $link.text().trim();
    if (!name || name.length < 2) return;

    const nationCode = $row.find(".country__name-short").first().text().trim().toUpperCase();

    const nums = ($row.text().match(/\b\d+\b/g) || [])
      .map(Number)
      .filter((n) => n >= 1 && n <= 9999);
    const points = nums.length > 0 ? Math.max(...nums) : 0;

    seen.add(athleteId);
    standings.push({ athleteId, athleteName: name, nationCode, points, gender });
  });

  return standings.sort((a, b) => b.points - a.points);
}

// ---------------------------------------------------------------------------
// Athlete pool
// ---------------------------------------------------------------------------

/**
 * Fetch the athlete pool for a given gender from the last 5 completed events.
 */
export async function fetchAthletePool(
  gender: string,
  seasonCode: string
): Promise<{ id: string; name: string; nationCode: string }[]> {
  const calendar = await fetchCalendar(seasonCode);
  const now = new Date();

  // Unique event IDs for past events of this gender, most recent first
  const pastEventIds = [
    ...new Set(
      calendar
        .filter((r) => r.gender === gender && r.date < now)
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .map((r) => r.eventId)
    ),
  ].slice(0, 5);

  const points = new Map<string, number>();
  const athleteData = new Map<string, { name: string; nationCode: string }>();

  for (const eventId of pastEventIds) {
    try {
      const races = await fetchEventRaces(eventId, seasonCode);
      const genderRaces = races.filter((r) => r.gender === gender);

      for (const race of genderRaces) {
        try {
          const results = await fetchResults(race.fisRaceId);
          for (const r of results) {
            athleteData.set(r.athleteId, { name: r.athleteName, nationCode: r.nationCode });
            points.set(r.athleteId, (points.get(r.athleteId) ?? 0) + wcPoints(r.rank));
          }
        } catch {
          // ignore individual race fetch failures
        }
      }
    } catch {
      // ignore event detail fetch failures
    }
  }

  return Array.from(athleteData.entries())
    .map(([id, { name, nationCode }]) => ({ id, name, nationCode, pts: points.get(id) ?? 0 }))
    .sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name))
    .map(({ id, name, nationCode }) => ({ id, name, nationCode }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a human-readable race name from its components.
 * Examples:
 *   "Women Sprint Final Free - Ruka"
 *   "Men Interval Start 10km Classic - Davos"
 *   "Women Mass Start 20km Free - Oslo"
 *   "Women Skiathlon 7.5+7.5km - Toblach"
 *   "Men Pursuit 10km Free - Toblach"
 */
export function buildRaceName(
  gender: "M" | "W",
  discipline: string,
  technique: string,
  venue: string
): string {
  const g = gender === "W" ? "Women" : "Men";
  // Skiathlon already implies the technique (classic + free); don't repeat it
  const techPart = technique && technique !== "Skiathlon" ? ` ${technique}` : "";
  return `${g} ${discipline}${techPart} - ${venue}`;
}

/**
 * Extract the full race type + distance from an event detail page row.
 * Returns values like "Sprint Final", "Interval Start 10km", "Mass Start 20km",
 * "Skiathlon 7.5+7.5km", "Pursuit 10km".
 *
 * Qualifications are filtered before this function is called, so any remaining
 * sprint row is a final.
 */
function extractDisciplineFromRow(text: string): string {
  const t = text.toLowerCase();

  // Sprint — qualifications are already excluded; remaining sprints are finals
  if (t.includes("sprint")) {
    return t.includes("final") ? "Sprint Final" : "Sprint";
  }

  // Skiathlon — distance expressed as two legs, e.g. "7.5 + 7.5km" or "7.5km + 7.5km"
  if (t.includes("skiathlon") || t.includes("skiatlon")) {
    // Handles: "7.5 + 7.5km", "7.5km + 7.5km", "7.5 km + 7.5 km"
    const doubleMatch = text.match(/(\d+(?:[.,]\d+)?)\s*km?\s*\+\s*(\d+(?:[.,]\d+)?)\s*km/i);
    if (doubleMatch) {
      const d1 = doubleMatch[1].replace(",", ".");
      const d2 = doubleMatch[2].replace(",", ".");
      return `Skiathlon ${d1}+${d2}km`;
    }
    const singleMatch = text.match(/(\d+(?:[.,]\d+)?)\s*km/i);
    if (singleMatch) return `Skiathlon ${singleMatch[1].replace(",", ".")}km`;
    return "Skiathlon";
  }

  // Pursuit
  if (t.includes("pursuit")) {
    const m = text.match(/(\d+(?:[.,]\d+)?)\s*km/i);
    const dist = m ? ` ${m[1].replace(",", ".")}km` : "";
    return `Pursuit${dist}`;
  }

  // Mass Start
  if (t.includes("mass start") || t.includes("massstart")) {
    const m = text.match(/(\d+(?:[.,]\d+)?)\s*km/i);
    const dist = m ? ` ${m[1].replace(",", ".")}km` : "";
    return `Mass Start${dist}`;
  }

  // Default: Interval Start (the standard WC distance format)
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*km/i);
  const dist = m ? ` ${m[1].replace(",", ".")}km` : "";
  return `Interval Start${dist}`;
}

/**
 * Extract technique (Classic / Free) from row text.
 * Skiathlon is its own technique (inherently both classical and freestyle).
 * Pursuit and Mass Start default to "Free" when no explicit technique is found.
 */
function extractTechnique(text: string, discipline: string): string {
  if (/skiathlon|skiatlon/i.test(text)) return "Skiathlon";
  if (/classic(al)?/i.test(text)) return "Classic";
  if (/free(style)?/i.test(text)) return "Free";

  // FIS often appends " C" (classic) or " F" / " FS" (free) at end of short codes
  // Match only when followed by whitespace, slash, or end-of-string to avoid false positives
  if (/ FS(?:[/\s]|$)/.test(text)) return "Free";
  if (/ F(?:[/\s]|$)/.test(text)) return "Free";
  if (/ C(?:[/\s]|$)/.test(text)) return "Classic";

  // Pursuit is always freestyle
  if (discipline === "Pursuit") return "Free";

  return "";
}
