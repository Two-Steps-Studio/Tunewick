"use client";

/**
 * In-app progress feedback: what a listen earned, goals reached, streaks, "on a roll". One small
 * notice at a time, each celebration at most once per day — progress should feel like part of
 * listening, never like popups.
 */

import { useSyncExternalStore } from "react";
import type { Goal } from "@tunewick/shared";

export type Notice =
  | {
      id: number;
      kind: "award";
      points: number;
      parts: string[];
      country?: string;
    }
  | { id: number; kind: "goal"; goal: Goal["key"]; target: number }
  | { id: number; kind: "streak"; days: number }
  | { id: number; kind: "roll"; count: number }
  | { id: number; kind: "achievement"; code: string };

/** What one listen earned (record_listen). */
export interface ListenAwards {
  awards: { kind: string; points: number; genre?: number; country?: string }[];
  achievements: string[];
  throttled?: boolean;
}

type NoticeInput = Notice extends infer N ? (N extends Notice ? Omit<N, "id"> : never) : never;

const ROLL_MILESTONES = [5, 10, 25, 50, 100];
const SHOW_MS = 3800;

let queue: Notice[] = [];
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function schedule() {
  if (timer || !queue.length) return;
  timer = setTimeout(() => {
    timer = null;
    queue = queue.slice(1);
    emit();
    schedule();
  }, SHOW_MS);
}

function push(notice: NoticeInput) {
  // Never pile up: at most three waiting, the oldest award gives way.
  queue = [...queue, { ...notice, id: nextId++ } as Notice].slice(-3);
  emit();
  schedule();
}

export function dismissNotice() {
  if (timer) clearTimeout(timer);
  timer = null;
  queue = queue.slice(1);
  emit();
  schedule();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useCurrentNotice(): Notice | null {
  return useSyncExternalStore(
    subscribe,
    () => queue[0] ?? null,
    () => null,
  );
}

/** Once per local day per key (best effort; storage may be unavailable). */
function firstToday(key: string): boolean {
  const day = new Date().toLocaleDateString("en-CA");
  const storageKey = `tw.celebrated.${day}.${key}`;
  try {
    if (localStorage.getItem(storageKey)) return false;
    localStorage.setItem(storageKey, "1");
  } catch {}
  return true;
}

interface TodayProgress {
  todaySongs: number;
  currentStreak: number;
  goals: Goal[];
}

let checking = false;

async function celebrate() {
  if (checking) return;
  checking = true;
  try {
    const response = await fetch("/api/progress", { cache: "no-store" });
    if (response.status !== 200) return;
    const today = (await response.json()) as TodayProgress;
    if (today.todaySongs === 1 && today.currentStreak > 1 && firstToday("streak")) {
      push({ kind: "streak", days: today.currentStreak });
    }
    for (const goal of today.goals) {
      if (goal.done && firstToday(`goal.${goal.key}.${goal.period}`)) {
        push({ kind: "goal", goal: goal.key, target: goal.target });
      }
    }
    const milestone = ROLL_MILESTONES.filter((m) => today.todaySongs >= m).at(-1);
    if (milestone && firstToday(`roll.${milestone}`))
      push({ kind: "roll", count: today.todaySongs });
  } catch {
    // Celebrations are a bonus; a failed check is silent.
  } finally {
    checking = false;
  }
}

/** Shows what one listen earned and checks for goals/streaks when it was a discovery. */
export function reportAwards(result: ListenAwards | null) {
  if (!result) return;
  const points = result.awards.reduce((sum, award) => sum + award.points, 0);
  const discovery = result.awards.some((award) => award.kind === "new_song");
  if (points > 0) {
    const country = result.awards.find((award) => award.kind === "new_country")?.country;
    push({
      kind: "award",
      points,
      parts: result.awards.filter((award) => award.points > 0).map((award) => award.kind),
      ...(country ? { country } : {}),
    });
  }
  for (const code of result.achievements) push({ kind: "achievement", code });
  if (discovery) void celebrate();
}

/** Points for a share (no listen involved). */
export function reportSharePoints(points: number) {
  if (points > 0) push({ kind: "award", points, parts: ["share"] });
}
