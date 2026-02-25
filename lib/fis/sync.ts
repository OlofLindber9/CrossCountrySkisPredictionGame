import { prisma } from "@/lib/prisma";
import {
  fetchCalendar,
  fetchEventRaces,
  fetchResults,
  fetchWcStandings,
  buildRaceName,
  type FisEventRace,
} from "./fetcher";
import { calculateScore, getPodiumFromResults } from "@/lib/scoring";

/** Current FIS season code (ending year, e.g. 2026 = 2025-26 season) */
export function currentSeasonCode(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed; season starts ~Oct/Nov
  return month >= 7 ? String(year + 1) : String(year);
}

/**
 * Fetch the FIS calendar and upsert individual races into the DB.
 *
 * For each event in the calendar we call the event detail page to get every
 * individual race (Sprint Classic, 10km Free, Skiathlon, etc.).  Each
 * individual race becomes one DB row with id = "fis-{fisRaceId}".
 *
 * Qualification, relay, and team-sprint races are excluded automatically by
 * the fetcher.  Old-format race rows (id not starting with "fis-") that have
 * no predictions or results are cleaned up on each sync.
 */
export async function syncCalendar(): Promise<number> {
  const seasonCode = currentSeasonCode();
  const season = `${parseInt(seasonCode) - 1}-${seasonCode}`;

  // Calendar gives us one placeholder per event per gender
  // (we only need it for venue / country / date)
  const calendarEvents = await fetchCalendar(seasonCode);

  // Build a map eventId → { venue, country, date }
  const eventMeta = new Map<string, { venue: string; country: string; date: Date }>();
  for (const ev of calendarEvents) {
    if (!eventMeta.has(ev.eventId)) {
      eventMeta.set(ev.eventId, { venue: ev.venue, country: ev.country, date: ev.date });
    }
  }

  const uniqueEventIds = [...eventMeta.keys()];
  let total = 0;

  for (const eventId of uniqueEventIds) {
    const meta = eventMeta.get(eventId)!;

    let races: FisEventRace[];
    try {
      races = await fetchEventRaces(eventId, seasonCode, meta.date);
    } catch {
      races = [];
    }

    for (const race of races) {
      const raceId = `fis-${race.fisRaceId}`;
      const name = buildRaceName(race.gender, race.discipline, race.technique, meta.venue);
      const raceDate = race.date ?? meta.date;

      await prisma.race.upsert({
        where: { id: raceId },
        update: {
          name,
          venue: meta.venue,
          country: meta.country,
          date: raceDate,
          discipline: race.discipline,
          technique: race.technique,
          gender: race.gender,
          fisRaceId: race.fisRaceId,
          eventId,
        },
        create: {
          id: raceId,
          name,
          venue: meta.venue,
          country: meta.country,
          date: raceDate,
          discipline: race.discipline,
          technique: race.technique,
          gender: race.gender,
          season,
          fisRaceId: race.fisRaceId,
          eventId,
        },
      });
      total++;
    }
  }

  // Remove old-format races (legacy "{eventId}-{gender}" IDs) that have no
  // predictions or results attached — safe one-time migration cleanup.
  await prisma.race.deleteMany({
    where: {
      NOT: { id: { startsWith: "fis-" } },
      predictions: { none: {} },
      results: { none: {} },
    },
  });

  return total;
}

/**
 * Sync results for one DB race using the given FIS race ID.
 * Upserts athletes + results, marks the race completed, and scores predictions.
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
 * Sync WC standings for both genders and update athlete wcPoints in DB.
 */
export async function syncWcStandings(): Promise<{ men: number; women: number }> {
  const seasonCode = currentSeasonCode();
  let men = 0;
  let women = 0;

  for (const gender of ["M", "W"] as const) {
    try {
      const standings = await fetchWcStandings(gender, seasonCode);
      for (const s of standings) {
        await prisma.athlete.upsert({
          where: { id: s.athleteId },
          update: { name: s.athleteName, nationCode: s.nationCode, gender, wcPoints: s.points },
          create: {
            id: s.athleteId,
            name: s.athleteName,
            nationCode: s.nationCode,
            gender,
            wcPoints: s.points,
          },
        });
      }
      if (gender === "M") men = standings.length;
      else women = standings.length;
    } catch {
      // Non-fatal
    }
  }

  return { men, women };
}

/**
 * Auto-sync results for all past races still marked "upcoming".
 * Safe to call on page load — skips races already completed.
 */
export async function syncCompletedRaces(): Promise<{ synced: number }> {
  const now = new Date();

  const pendingRaces = await prisma.race.findMany({
    where: {
      status: "upcoming",
      date: { lt: now },
      fisRaceId: { not: "" },
    },
  });

  let synced = 0;
  for (const race of pendingRaces) {
    try {
      const { results } = await syncRaceResults(race.id, race.fisRaceId);
      if (results >= 3) synced++;
    } catch {
      // ignore individual FIS fetch failures
    }
  }

  if (synced > 0) {
    await syncWcStandings().catch(() => {});
  }

  return { synced };
}
