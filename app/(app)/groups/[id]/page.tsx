import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "@/lib/utils";

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user!.id;

  const group = await prisma.group.findUnique({
    where: { id },
    include: {
      members: true,
    },
  });

  if (!group) notFound();

  // Verify membership
  const isMember = group.members.some((m) => m.userId === userId);
  if (!isMember) notFound();

  // All predictions for this group, with scores
  const predictions = await prisma.prediction.findMany({
    where: { groupId: id },
    include: {
      race: { select: { id: true, name: true, date: true, status: true, discipline: true, gender: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Compute leaderboard: sum of scores per user
  const scoresByUser: Record<string, number> = {};
  const predictionsByUser: Record<
    string,
    Array<{ race: typeof predictions[number]["race"]; score: number | null; first: string; second: string; third: string }>
  > = {};

  for (const pred of predictions) {
    scoresByUser[pred.userId] = (scoresByUser[pred.userId] || 0) + (pred.score ?? 0);
    if (!predictionsByUser[pred.userId]) predictionsByUser[pred.userId] = [];
    predictionsByUser[pred.userId].push({
      race: pred.race,
      score: pred.score,
      first: pred.first,
      second: pred.second,
      third: pred.third,
    });
  }

  // Get display names from profiles table
  const userIds = group.members.map((m) => m.userId);
  const profiles = await prisma.profile.findMany({
    where: { id: { in: userIds } },
  });
  const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p.displayName]));

  function displayName(uid: string): string {
    return profileMap[uid] || "Member " + uid.slice(0, 6);
  }

  const leaderboard = group.members
    .map((m) => ({
      userId: m.userId,
      displayName: displayName(m.userId),
      totalScore: scoresByUser[m.userId] || 0,
      predictionsCount: predictionsByUser[m.userId]?.length || 0,
      scoredCount: predictionsByUser[m.userId]?.filter((p) => p.score !== null).length || 0,
    }))
    .sort((a, b) => b.totalScore - a.totalScore);

  // Upcoming races (so members can make predictions)
  const upcomingRaces = await prisma.race.findMany({
    where: { status: "upcoming", date: { gte: new Date() } },
    orderBy: { date: "asc" },
    take: 5,
  });

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="glass-card">
        <div className="flex justify-between items-start">
          <div>
            <Link href="/groups" className="text-ski-ice text-sm hover:text-white transition-colors">← My groups</Link>
            <h1 className="text-2xl font-bold text-white mt-1">{group.name}</h1>
            <p className="text-white/50 text-sm mt-1">
              {group.members.length} member{group.members.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/40 mb-1">Invite code</p>
            <span className="font-mono font-bold text-ski-ice px-3 py-1.5 rounded-lg text-sm tracking-widest"
              style={{ background: "rgba(255,255,255,0.1)" }}>
              {group.inviteCode}
            </span>
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="glass-card">
        <h2 className="font-bold text-white mb-4">🏆 Leaderboard</h2>
        {leaderboard.length === 0 ? (
          <p className="text-white/40 text-sm">No members yet.</p>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((entry, i) => {
              const medals: Record<number, string> = { 0: "🥇", 1: "🥈", 2: "🥉" };
              const isCurrentUser = entry.userId === userId;
              return (
                <div
                  key={entry.userId}
                  className="flex items-center gap-4 px-4 py-3 rounded-xl border transition-all"
                  style={{
                    background: isCurrentUser
                      ? "rgba(168, 212, 240, 0.12)"
                      : i === 0
                      ? "rgba(245, 200, 66, 0.12)"
                      : i === 1
                      ? "rgba(255, 255, 255, 0.06)"
                      : i === 2
                      ? "rgba(232, 160, 32, 0.08)"
                      : "rgba(255, 255, 255, 0.04)",
                    borderColor: isCurrentUser
                      ? "rgba(168, 212, 240, 0.3)"
                      : i < 3
                      ? "rgba(232, 160, 32, 0.2)"
                      : "rgba(255, 255, 255, 0.08)",
                  }}
                >
                  <span className="text-xl w-8 text-center">
                    {medals[i] ?? <span className="text-white/40 font-bold text-base">{i + 1}</span>}
                  </span>
                  <div className="flex-1">
                    <span className="font-semibold text-sm text-white">
                      {entry.displayName}
                      {isCurrentUser && (
                        <span className="ml-2 text-xs text-ski-ice">(you)</span>
                      )}
                    </span>
                    <div className="text-xs text-white/40 mt-0.5">
                      {entry.scoredCount} race{entry.scoredCount !== 1 ? "s" : ""} scored
                    </div>
                  </div>
                  <span className="font-bold text-ski-accent text-lg">
                    {entry.totalScore} <span className="text-xs font-normal text-white/40">pts</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Upcoming races to predict */}
      {upcomingRaces.length > 0 && (
        <div className="glass-card">
          <h2 className="font-bold text-white mb-4">Predict upcoming races</h2>
          <div className="space-y-2">
            {upcomingRaces.map((race) => {
              const myPrediction = predictionsByUser[userId]?.find(
                (p) => p.race.id === race.id
              );
              return (
                <Link
                  key={race.id}
                  href={`/races/${race.id}`}
                  className="flex items-center justify-between p-3 rounded-xl border border-white/10 hover:border-white/25 hover:bg-white/8 transition-all"
                >
                  <div>
                    <div className="font-medium text-sm text-white/90">{race.name}</div>
                    <div className="text-xs text-white/40 mt-0.5">{format(race.date)}</div>
                  </div>
                  {myPrediction ? (
                    <span className="badge badge-green">Predicted</span>
                  ) : (
                    <span className="badge badge-yellow">Predict →</span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
