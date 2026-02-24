/**
 * FIS data fetcher
 *
 * Calendar:  data.fis-ski.com/fis_events/ajax/calendarfunctions/load_calendar.html
 * Results:   data.fis-ski.com/fis_events/ajax/raceresultsfunctions/details.html
 * Event:     www.fis-ski.com/DB/general/event-details.html  (individual race IDs)
 *
 * Calendar and results return HTML from data.fis-ski.com (AJAX endpoints).
 * Event detail is the main FIS website page — also HTML, parsed with cheerio.
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
 * Fetch individual race IDs for a FIS event, grouped by gender.
 * Scrapes the event detail page on the main FIS website, which lists every
 * individual race in an event weekend with its raceid link and gender marker.
 * Results are cached for 1 h by Next.js.
 */
export async function fetchEventRaceIds(
  eventId: string,
  seasonCode: string
): Promise<{ M: string[]; W: string[] }> {
  const url =
    `https://www.fis-ski.com/DB/general/event-details.html` +
    `?sectorcode=CC&eventid=${eventId}&seasoncode=${seasonCode}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SkiPredictor/1.0)" },
    next: { revalidate: 3600 },
  });

  if (!res.ok) return { M: [], W: [] };
  const html = await res.text();
  return parseEventRaceIds(html);
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
 * Parse individual race IDs from a FIS event detail page, grouped by gender.
 * Each race row in #eventdetailscontent contains:
 *   - a link with href "...?sectorcode=CC&raceid=XXXXX" → the race ID
 *   - .gender__item_l → Women's race
 *   - .gender__item_m → Men's race
 * Relay and team-sprint rows are excluded (no individual podium prediction).
 */
function parseEventRaceIds(html: string): { M: string[]; W: string[] } {
  const $ = cheerio.load(html);
  const result: { M: string[]; W: string[] } = { M: [], W: [] };

  $("#eventdetailscontent .table-row").each((_, row) => {
    const $row = $(row);

    // Extract race ID from any link in the row
    const href = $row.find("a[href*='raceid=']").first().attr("href") || "";
    const match = href.match(/[?&]raceid=(\d+)/);
    if (!match) return;
    const raceId = match[1];

    // Skip relay and team-sprint races — they have no individual podium
    const rowText = $row.text().toLowerCase();
    if (rowText.includes("relay") || rowText.includes("team sprint")) return;

    const isW = $row.find(".gender__item_l").length > 0;
    const isM = $row.find(".gender__item_m").length > 0;

    if (isW && !result.W.includes(raceId)) result.W.push(raceId);
    if (isM && !result.M.includes(raceId)) result.M.push(raceId);
  });

  return result;
}

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
    const year = yearMatch
      ? parseInt(yearMatch[1])
      : navMonth >= 9
        ? parseInt(seasonCode) - 1
        : parseInt(seasonCode);
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
// WC Standings
// ---------------------------------------------------------------------------

/**
 * Fetch the current overall FIS World Cup standings for a given gender.
 * Scrapes the FIS DB cup-standings page, which uses the same .table-row HTML
 * structure as other FIS DB pages.
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

  // FIS DB pages use .table-row for each athlete; athlete link contains competitorid
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

    // Points: largest integer in the row within a plausible WC points range.
    // Rank is at most ~100; season-end leaders reach ~2000 pts.
    // FIS competitor IDs (6 digits) are excluded by the ≤ 9999 cap.
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
// Athlete pool (for prediction forms on upcoming races)
// ---------------------------------------------------------------------------

/**
 * Fetch the athlete pool for a given gender by discovering race IDs dynamically
 * from the FIS calendar and event detail pages, then fetching results.
 * Uses the last 5 completed events so the list stays current each week.
 * Event detail pages are cached 1 h; results are fetched fresh.
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
        .map((r) => r.id.split("-")[0])
    ),
  ].slice(0, 5); // limit to last 5 events for reasonable load time

  const points = new Map<string, number>();
  const athleteData = new Map<string, { name: string; nationCode: string }>();

  for (const eventId of pastEventIds) {
    try {
      const ids = await fetchEventRaceIds(eventId, seasonCode);
      const raceIds = gender === "M" ? ids.M : ids.W;

      for (const raceId of raceIds) {
        try {
          const results = await fetchResults(raceId);
          for (const r of results) {
            athleteData.set(r.athleteId, { name: r.athleteName, nationCode: r.nationCode });
            points.set(r.athleteId, (points.get(r.athleteId) ?? 0) + wcPoints(r.rank));
          }
        } catch {
          // Ignore individual race fetch failures
        }
      }
    } catch {
      // Ignore event detail fetch failures
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

