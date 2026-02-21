import { NextResponse } from "next/server";
import { syncCalendar, syncRaceResults, syncCompletedRaces } from "@/lib/fis/sync";

// POST /api/fis/sync                                   — sync calendar
// POST /api/fis/sync?action=results&raceId=58060-W&fisRaceId=49729 — sync one race
// POST /api/fis/sync?action=auto                       — sync all past races
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const raceId = searchParams.get("raceId");
  const fisRaceId = searchParams.get("fisRaceId");

  try {
    if (action === "results" && raceId && fisRaceId) {
      const { results, scored } = await syncRaceResults(raceId, fisRaceId);
      if (results === 0) {
        return NextResponse.json({ error: "No results found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, results, scored });
    }

    if (action === "auto") {
      const { synced } = await syncCompletedRaces();
      return NextResponse.json({ ok: true, synced });
    }

    const total = await syncCalendar();
    return NextResponse.json({ ok: true, total });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
