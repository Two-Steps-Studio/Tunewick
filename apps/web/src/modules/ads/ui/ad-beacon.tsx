"use client";

import { type ReactNode, useEffect, useRef } from "react";

function send(id: string, placement: string, kind: "impression" | "click") {
  const body = JSON.stringify({ id, placement, kind });
  if (!navigator.sendBeacon?.("/api/ads/event", new Blob([body], { type: "application/json" }))) {
    void fetch("/api/ads/event", { method: "POST", body, keepalive: true }).catch(() => undefined);
  }
}

/**
 * Counts an impression once half the card has been on screen for a second, and a click on any
 * link inside. Anonymous: only the campaign and the placement are sent.
 */
export function AdBeacon({
  id,
  placement,
  children,
}: {
  id: string;
  placement: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          timer = setTimeout(() => {
            send(id, placement, "impression");
            observer.disconnect();
          }, 1000);
        } else if (timer) {
          clearTimeout(timer);
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [id, placement]);
  return (
    <div
      ref={ref}
      onClickCapture={(event) => {
        if ((event.target as HTMLElement).closest("a")) send(id, placement, "click");
      }}
    >
      {children}
    </div>
  );
}
