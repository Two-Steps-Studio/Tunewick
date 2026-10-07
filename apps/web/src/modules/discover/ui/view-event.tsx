"use client";

import { useEffect } from "react";

/** Records that a page was viewed (product analytics; dropped for visitors by the server). */
export function ViewEvent({ name }: { name: "ranking_viewed" | "weekly_recap_viewed" }) {
  useEffect(() => {
    void fetch("/api/discover/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: [{ name }] }),
      keepalive: true,
    }).catch(() => undefined);
  }, [name]);
  return null;
}
