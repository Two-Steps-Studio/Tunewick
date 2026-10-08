import { NextResponse } from "next/server";
import { getMyChallenges, getMyProgress } from "@/modules/progress";

/** Today's progress for in-feed celebrations (goal reached, streak, "on a roll", challenge). */
export async function GET() {
  const progress = await getMyProgress();
  if (!progress) return new NextResponse(null, { status: 204 });
  const challenges = await getMyChallenges();
  return NextResponse.json(
    {
      todaySongs: progress.todaySongs,
      pointsToday: progress.pointsToday,
      currentStreak: progress.currentStreak,
      goals: progress.goals,
      challenges: challenges.map((c) => ({
        code: c.code,
        target: c.target,
        completedAt: c.completedAt,
        endsAt: c.endsAt,
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
