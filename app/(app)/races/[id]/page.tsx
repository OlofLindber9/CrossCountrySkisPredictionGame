import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { format, disciplineColor, genderLabel, wcPoints } from "@/lib/utils";
import PredictionForm from "@/components/PredictionForm";
import ResultsPodium from "@/components/ResultsPodium";
import { fetchAthletePool } from "@/lib/fis/fetcher";
import { syncRaceResults, currentSeasonCode } from "@/lib/fis/sync";

export default async function RacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user!.id;

  // Server action: sync results for this specific race on demand.
  // Not called automatically — the page always loads from DB first.
  async function syncRaceAction() {
    "use server";
    const meta = await prisma.race.findUnique({
      where: { id },
      select: { fisRaceIds: true },
    });
    if (!meta) return;
    for (const fisRaceId of meta.fisRaceIds) {
      try {
        const { results } = await syncRaceResults(id, fisRaceId);
        if (results >= 3) break;
      } catch {
        // ignore individual failures
      }
    }
    revalidatePath(`/races/${id}`);
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

  const memberships = await prisma.groupMembership.findMany({
    where: { userId },
    include: { group: true },
  });

  const existingPredictions = await prisma.prediction.findMany({
    where: { userId, raceId: id },
    include: { race: { select: { name: true } } },
  });

  // Athlete pool: use race results if completed, otherwise build from DB results
  // across all completed same-gender races. Falls back to FIS fetch only when
  // the DB has no results at all (cold start before any sync).
  let athletePool: { id: string; name: string; nationCode: string }[] = [];

  if (race.results.length > 0) {
    athletePool = race.results.map((r) => ({
      id: r.athlete.id,
      name: r.athlete.name,
      nationCode: r.athlete.nationCode,
    }));
  } else {
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
      athletePool = await fetchAthletePool(race.gender, currentSeasonCode());
    }
  }

  const podium =
    race.results.length >= 3
      ? { first: race.results[0], second: race.results[1], third: race.results[2] }
      : null;

  const isCompleted = race.status === "completed";
  const isPast = isCompleted || race.date < new Date();
  const canSyncResults = isPast && !isCompleted && race.fisRaceIds.length > 0;

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      {/* Race header */}
      <div className="glass-card">
        <div className="flex flex-wrap gap-2 mb-3">
          <span className={`badge ${disciplineColor(race.discipline)}`}>{race.discipline}</span>
          <span className={`badge ${race.gender === "W" ? "badge-yellow" : "badge-blue"}`}>
            {genderLabel(race.gender)}
          </span>
          {isCompleted && <span className="badge badge-green">Completed</span>}
          {!isCompleted && isPast && <span className="badge badge-gray">Past</span>}
          {!isPast && <span className="badge badge-blue">Upcoming</span>}
        </div>
        <h1 className="text-2xl font-bold text-white">{race.name}</h1>
        <p className="text-white/50 mt-1">
          {format(race.date)} · {race.venue}, {race.country}
        </p>

        {/* Load results button — shown for past races not yet synced */}
        {canSyncResults && (
          <form action={syncRaceAction} className="mt-4">
            <button type="submit" className="btn-secondary text-sm">
              Load results
            </button>
          </form>
        )}
      </div>

      {/* Official results */}
      {podium && (
        <div className="glass-card">
          <h2 className="font-bold text-white mb-4">Official results</h2>
          <ResultsPodium results={race.results.slice(0, 10)} />
        </div>
      )}

      {/* Predictions section */}
      {memberships.length === 0 ? (
        <div className="glass-card text-center py-8">
          <p className="text-white/50 mb-3">Join or create a group to make predictions.</p>
          <div className="flex gap-3 justify-center">
            <Link href="/groups/create" className="btn-primary text-sm">Create group</Link>
            <Link href="/groups/join" className="btn-secondary text-sm">Join group</Link>
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
          locked={isPast}
        />
      )}
    </div>
  );
}
