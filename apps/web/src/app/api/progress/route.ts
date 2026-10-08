import { NextResponse } from "next/server";
import { getMyMissions, getMyProgress } from "@/modules/progress";

/** Today's progress for in-feed celebrations (goal reached, streak, "on a roll", mission). */
export async function GET() {
  const progress = await getMyProgress();
  if (!progress) return new NextResponse(null, { status: 204 });
  const missions = await getMyMissions();
  return NextResponse.json(
    {
      todaySongs: progress.todaySongs,
      pointsToday: progress.pointsToday,
      currentStreak: progress.currentStreak,
      goals: progress.goals,
      missions: missions.map((m) => ({
        code: m.code,
        metric: m.metric,
        target: m.target,
        xp: m.xp,
        completedAt: m.completedAt,
        endsAt: m.endsAt,
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
