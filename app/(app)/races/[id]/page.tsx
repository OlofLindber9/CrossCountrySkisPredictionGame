import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { format, disciplineColor, genderLabel, wcPoints } from "@/lib/utils";
import PredictionForm from "@/components/PredictionForm";
import ResultsPodium from "@/components/ResultsPodium";
import { fetchAthletePool } from "@/lib/fis/fetcher";
import { syncRaceResults } from "@/lib/fis/sync";

export default async function RacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user!.id;

  // Auto-sync: if the race date has passed and we have no results yet, fetch from FIS.
  // Only runs once per race — after syncing the race is marked "completed" and skipped.
  const raceMeta = await prisma.race.findUnique({
    where: { id },
    select: { status: true, date: true, fisRaceIds: true },
  });
  if (
    raceMeta &&
    raceMeta.status === "upcoming" &&
    raceMeta.date < new Date() &&
    raceMeta.fisRaceIds.length > 0
  ) {
    for (const fisRaceId of raceMeta.fisRaceIds) {
      try {
        const { results } = await syncRaceResults(id, fisRaceId);
        if (results >= 3) break; // Valid podium found
      } catch {
        // Ignore failures — we'll just show upcoming state
      }
    }
  }

  const race = await prisma.race.findUnique({
    where: { id },
    include: {
      results: {
        orderBy: { rank: "asc" },
        include: { athlete: true },
      },
    },
  });

  if (!race) notFound();

  // Get user's groups for the prediction form
  const memberships = await prisma.groupMembership.findMany({
    where: { userId },
    include: { group: true },
  });

  // Get user's existing predictions for this race (keyed by groupId)
  const existingPredictions = await prisma.prediction.findMany({
    where: { userId, raceId: id },
    include: {
      race: { select: { name: true } },
    },
  });

  // Build athlete pool for the prediction picker.
  // Priority: (1) race's own results if completed, (2) athletes from other completed
  // same-gender races in DB, (3) FIS seed fetch (cached 24h by Next.js — fast after first load).
  let athletePool: { id: string; name: string; nationCode: string }[] = [];

  if (race.results.length > 0) {
    // Completed race — use its own result list
    athletePool = race.results.map((r) => ({
      id: r.athlete.id,
      name: r.athlete.name,
      nationCode: r.athlete.nationCode,
    }));
  } else {
    // Upcoming race — build athlete pool from all synced same-gender results in the DB.
    // Calculate accumulated WC points so athletes are ordered by current season standing.
    // This updates automatically whenever new race results are synced.
    const allResults = await prisma.result.findMany({
      where: { race: { gender: race.gender, status: "completed" } },
      include: { athlete: true },
    });

    if (allResults.length > 0) {
      const points = new Map<string, number>();
      const athleteMap = new Map<string, { name: string; nationCode: string }>();
      for (const r of allResults) {
        athleteMap.set(r.athlete.id, { name: r.athlete.name, nationCode: r.athlete.nationCode });
        points.set(r.athlete.id, (points.get(r.athlete.id) ?? 0) + wcPoints(r.rank));
      }
      athletePool = Array.from(athleteMap.entries())
        .map(([id, { name, nationCode }]) => ({ id, name, nationCode, pts: points.get(id) ?? 0 }))
        .sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name))
        .map(({ id, name, nationCode }) => ({ id, name, nationCode }));
    } else {
      // No results synced yet — fall back to FIS-fetched pool sorted by accumulated
      // WC points from the hardcoded season race list (cached 24h by Next.js).
      athletePool = await fetchAthletePool(race.gender);
    }
  }

  const podium =
    race.results.length >= 3
      ? {
          first: race.results[0],
          second: race.results[1],
          third: race.results[2],
        }
      : null;

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      {/* Race header */}
      <div className="card">
        <div className="flex flex-wrap gap-2 mb-3">
          <span className={`badge ${disciplineColor(race.discipline)}`}>{race.discipline}</span>
          <span className={`badge ${race.gender === "W" ? "badge-yellow" : "badge-blue"}`}>
            {genderLabel(race.gender)}
          </span>
          <span className={`badge ${race.status === "completed" ? "badge-green" : "badge-blue"}`}>
            {race.status === "completed" ? "Completed" : "Upcoming"}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-ski-blue">{race.name}</h1>
        <p className="text-gray-500 mt-1">
          {format(race.date)} · {race.venue}, {race.country}
        </p>
      </div>

      {/* Official results (if completed) */}
      {podium && (
        <div className="card">
          <h2 className="font-bold text-ski-blue mb-4">Official results</h2>
          <ResultsPodium results={race.results.slice(0, 10)} />
        </div>
      )}

      {/* Predictions section */}
      {memberships.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-gray-500 mb-3">Join or create a group to make predictions.</p>
          <div className="flex gap-3 justify-center">
            <a href="/groups/create" className="btn-primary text-sm">Create group</a>
            <a href="/groups/join" className="btn-secondary text-sm">Join group</a>
          </div>
        </div>
      ) : (
        <PredictionForm
          race={{ id: race.id, name: race.name, status: race.status }}
          groups={memberships.map((m) => m.group)}
          existingPredictions={existingPredictions.map((p) => ({
            groupId: p.groupId,
            first: p.first,
            second: p.second,
            third: p.third,
            score: p.score,
          }))}
          athletePool={athletePool}
        />
      )}
    </div>
  );
}
