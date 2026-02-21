import { prisma } from "@/lib/prisma";
import { fetchCalendar, fetchResults } from "./fetcher";
import { calculateScore, getPodiumFromResults } from "@/lib/scoring";

/** Current FIS season code (ending year, e.g. 2026 = 2025-26 season) */
export function currentSeasonCode(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed; season starts ~Oct/Nov
  return month >= 7 ? String(year + 1) : String(year);
}

/**
 * Known FIS individual race IDs for the 2025-26 WC season, by venue and gender.
 * These map our one-race-per-event DB records to the specific FIS race IDs
 * used to fetch results from the FIS results endpoint.
 *
 * Lookup is done by substring match on venue name (case-insensitive).
 * Update this list each season or when new venues are confirmed.
 */
const VENUE_RACE_IDS: Record<string, { M: string[]; W: string[] }> = {
  Ruka:        { M: ["49463", "49465", "49467"], W: ["49464", "49466", "49468"] },
  Lillehammer: { M: ["49477", "49479"],          W: ["49478"] },
  Davos:       { M: ["49489", "49491"],          W: ["49490"] },
  Toblach:     { M: ["49541", "49547", "49549"], W: ["49542", "49548"] },
  Goms:        { M: [],                          W: ["49500"] },
};

function lookupFisRaceIds(venue: string, gender: string): string[] {
  const venueLower = venue.toLowerCase();
  for (const [key, genderMap] of Object.entries(VENUE_RACE_IDS)) {
    if (venueLower.includes(key.toLowerCase())) {
      return genderMap[gender as "M" | "W"] ?? [];
    }
  }
  return [];
}

/**
 * Fetch the FIS calendar and upsert races into the DB.
 * Also populates fisRaceIds from the VENUE_RACE_IDS map.
 */
export async function syncCalendar(): Promise<number> {
  const seasonCode = currentSeasonCode();
  const races = await fetchCalendar(seasonCode);

  for (const race of races) {
    const fisRaceIds = lookupFisRaceIds(race.venue, race.gender);
    await prisma.race.upsert({
      where: { id: race.id },
      update: {
        name: race.name,
        venue: race.venue,
        country: race.country,
        date: race.date,
        discipline: race.discipline,
        gender: race.gender,
        fisRaceIds,
      },
      create: { ...race, fisRaceIds },
    });
  }

  return races.length;
}

/**
 * Sync results for one DB race using the given FIS race ID.
 * Upserts athletes + results, marks the race completed, and scores predictions.
 * Returns { results: number; scored: number }.
 */
export async function syncRaceResults(
  raceId: string,
  fisRaceId: string
): Promise<{ results: number; scored: number }> {
  const fisResults = await fetchResults(fisRaceId);
  if (fisResults.length === 0) return { results: 0, scored: 0 };

  // Upsert athletes
  for (const r of fisResults) {
    await prisma.athlete.upsert({
      where: { id: r.athleteId },
      update: { name: r.athleteName, nationCode: r.nationCode },
      create: { id: r.athleteId, name: r.athleteName, nationCode: r.nationCode },
    });
  }

  // Upsert results
  for (const r of fisResults) {
    await prisma.result.upsert({
      where: { raceId_athleteId: { raceId, athleteId: r.athleteId } },
      update: { rank: r.rank },
      create: { raceId, athleteId: r.athleteId, rank: r.rank },
    });
  }

  // Mark race as completed
  await prisma.race.update({
    where: { id: raceId },
    data: { status: "completed" },
  });

  // Score all predictions for this race
  const podium = getPodiumFromResults(
    fisResults.map((r) => ({ athleteId: r.athleteId, rank: r.rank }))
  );

  let scored = 0;
  if (podium) {
    const predictions = await prisma.prediction.findMany({ where: { raceId } });
    for (const pred of predictions) {
      const score = calculateScore(
        { first: pred.first, second: pred.second, third: pred.third },
        podium
      );
      await prisma.prediction.update({ where: { id: pred.id }, data: { score } });
      scored++;
    }
  }

  return { results: fisResults.length, scored };
}

/**
 * Auto-sync results for all past races that are still marked "upcoming".
 * For each such race, tries each fisRaceId in order and uses the first one
 * that returns a valid podium (≥ 3 ranked finishers).
 *
 * Safe to call on page load — only fetches from FIS when a race actually needs
 * syncing. Once a race is marked "completed" it is skipped on all future calls.
 */
export async function syncCompletedRaces(): Promise<{ synced: number }> {
  const now = new Date();

  // Only races whose date has passed, are still upcoming, and have known FIS IDs
  const pendingRaces = await prisma.race.findMany({
    where: {
      status: "upcoming",
      date: { lt: now },
      fisRaceIds: { isEmpty: false },
    },
  });

  let synced = 0;
  for (const race of pendingRaces) {
    for (const fisRaceId of race.fisRaceIds) {
      try {
        const { results } = await syncRaceResults(race.id, fisRaceId);
        if (results >= 3) {
          synced++;
          break; // Valid podium found — stop trying other IDs for this race
        }
      } catch {
        // Ignore individual FIS fetch failures
      }
    }
  }

  return { synced };
}
