import { NextResponse } from "next/server";
import { getMyProgress } from "@/modules/progress";

/** Today's progress for in-feed celebrations (goal reached, streak, "on a roll"). */
export async function GET() {
  const progress = await getMyProgress();
  if (!progress) return new NextResponse(null, { status: 204 });
  return NextResponse.json(
    {
      todaySongs: progress.todaySongs,
      pointsToday: progress.pointsToday,
      currentStreak: progress.currentStreak,
      goals: progress.goals,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
