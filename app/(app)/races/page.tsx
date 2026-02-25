import { prisma } from "@/lib/prisma";
import { syncCalendar, syncCompletedRaces } from "@/lib/fis/sync";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { format, genderLabel, genderColor, distanceLabel, techniqueLabel } from "@/lib/utils";

async function refreshCalendarAction() {
  "use server";
  await syncCalendar();
  revalidatePath("/races");
}

async function syncResultsAction() {
  "use server";
  // Always refresh the calendar first so fisRaceIds are populated for every
  // event before we attempt to sync results. The fetch is cached by Next.js
  // for 1 h so this is cheap on repeated clicks.
  await syncCalendar();
  await syncCompletedRaces();
  revalidatePath("/races");
}

export default async function RacesPage() {
  // Only hit FIS when the DB has no races yet. After that, data comes
  // straight from the DB so the page stays fast.
  const raceCount = await prisma.race.count();
  if (raceCount === 0) {
    await syncCalendar().catch(() => {});
  }

  const races = await prisma.race.findMany({
    orderBy: { date: "asc" },
    include: {
      _count: { select: { predictions: true, results: true } },
      results: {
        where: { rank: 1 },
        include: { athlete: true },
        take: 1,
      },
    },
  });

  const now = new Date();
  const upcoming = races.filter((r) => r.status === "upcoming" && r.date >= now);
  const past = races.filter((r) => r.status === "completed" || r.date < now);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <h1 className="text-2xl font-bold text-white">2025/26 Season</h1>
        <div className="flex gap-2">
          <form action={syncResultsAction}>
            <button type="submit" className="btn-primary text-sm">
              Sync results
            </button>
          </form>
          <form action={refreshCalendarAction}>
            <button type="submit" className="btn-secondary text-sm">
              Refresh calendar
            </button>
          </form>
        </div>
      </div>

      {races.length === 0 && (
        <div className="glass-card text-center py-12">
          <div className="text-4xl mb-3">📅</div>
          <p className="text-white/50 mb-4">Could not load races from FIS.</p>
          <p className="text-sm text-white/40">
            Check your internet connection and try refreshing.
          </p>
        </div>
      )}

      {upcoming.length > 0 && (
        <section>
          <h2 className="font-bold text-lg text-white/70 mb-3">Upcoming</h2>
          <div className="grid gap-3">
            {upcoming.map((race) => (
              <RaceCard key={race.id} race={race} />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="font-bold text-lg text-white/70 mb-3">Past</h2>
          <div className="grid gap-3">
            {past.map((race) => (
              <RaceCard key={race.id} race={race} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function RaceCard({
  race,
}: {
  race: {
    id: string;
    name: string;
    venue: string;
    country: string;
    date: Date;
    discipline: string;
    technique?: string;
    gender: string;
    status: string;
    _count: { predictions: number; results: number };
    results: { rank: number | null; athlete: { name: string; nationCode: string } }[];
  };
}) {
  const isCompleted = race.status === "completed";
  const isPast = isCompleted || race.date < new Date();
  const winner = race.results[0]?.athlete;

  return (
    <Link
      href={`/races/${race.id}`}
      className={`glass-card hover:border-white/30 hover:shadow-xl transition-all flex items-center justify-between gap-4 overflow-hidden ${isPast && !isCompleted ? "opacity-50" : ""}`}
    >
      <div className="flex-1 min-w-0">
        {/* 3 fixed-width badges — each starts at its own tab stop */}
        <div className="flex items-center gap-1.5 mb-1">
          <span className="badge badge-blue w-20 justify-center">{distanceLabel(race.discipline)}</span>
          <span className="badge badge-gray w-[6.5rem] justify-center">{techniqueLabel(race.technique)}</span>
          <span className={`badge ${genderColor(race.gender)} w-16 justify-center`}>{genderLabel(race.gender)}</span>
          {isCompleted && <span className="badge badge-green">Done</span>}
        </div>
        <div className="font-semibold text-white truncate">{race.name}</div>
        <div className="text-sm text-white/40 mt-0.5 truncate">
          {format(race.date)} · {race.venue}, {race.country}
        </div>
        {winner && (
          <div className="text-sm text-white/50 mt-1 truncate">
            🥇 {winner.name} ({winner.nationCode})
          </div>
        )}
      </div>
      <div className="text-right text-xs text-white/40 shrink-0">
        <div>{race._count.predictions} predictions</div>
      </div>
    </Link>
  );
}
