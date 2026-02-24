import { prisma } from "@/lib/prisma";
import { fetchCalendar, fetchEventRaceIds, fetchResults } from "./fetcher";
import { calculateScore, getPodiumFromResults } from "@/lib/scoring";

/** Current FIS season code (ending year, e.g. 2026 = 2025-26 season) */
export function currentSeasonCode(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed; season starts ~Oct/Nov
  return month >= 7 ? String(year + 1) : String(year);
}

/**
 * Fetch the FIS calendar and upsert races into the DB.
 * Race IDs are discovered dynamically by fetching each event's detail page on
 * the FIS website, so no manual hardcoding is needed as new events are added.
 */
export async function syncCalendar(): Promise<number> {
  const seasonCode = currentSeasonCode();
  const races = await fetchCalendar(seasonCode);

  // Fetch race IDs once per unique event (calendar has up to 2 entries per
  // event — one for M, one for W — so we deduplicate to halve the requests).
  const uniqueEventIds = [...new Set(races.map((r) => r.id.split("-")[0]))];
  const raceIdsByEvent = new Map<string, { M: string[]; W: string[] }>();

  for (const eventId of uniqueEventIds) {
    try {
      raceIdsByEvent.set(eventId, await fetchEventRaceIds(eventId, seasonCode));
    } catch {
      raceIdsByEvent.set(eventId, { M: [], W: [] });
    }
  }

  for (const race of races) {
    const eventId = race.id.split("-")[0];
    const gender = race.gender as "M" | "W";
    const fisRaceIds = raceIdsByEvent.get(eventId)?.[gender] ?? [];

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
 * Sync WC standings for both genders from FIS and update athlete wcPoints in DB.
 * Called automatically after syncCompletedRaces so the athlete pool stays current.
 */
export async function syncWcStandings(): Promise<{ men: number; women: number }> {
  const seasonCode = currentSeasonCode();
  let men = 0;
  let women = 0;

  for (const gender of ['M', 'W'] as const) {
    try {
      const standings = await fetchWcStandings(gender, seasonCode);
      for (const s of standings) {
        await prisma.athlete.upsert({
          where: { id: s.athleteId },
          update: { name: s.athleteName, nationCode: s.nationCode, gender, wcPoints: s.points },
          create: { id: s.athleteId, name: s.athleteName, nationCode: s.nationCode, gender, wcPoints: s.points },
        });
      }
      if (gender === 'M') men = standings.length;
      else women = standings.length;
    } catch {
      // Non-fatal — standings sync failure does not block result sync
    }
  }

  return { men, women };
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

  // Keep the athlete pool sorted by real standings after any race is processed
  if (synced > 0) {
    await syncWcStandings().catch(() => {}); // non-fatal
  }

  return { synced };
}
