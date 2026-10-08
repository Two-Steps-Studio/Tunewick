"use client";

import { DISCOVERY_MODES, type DiscoveryMode } from "@tunewick/shared";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "@/i18n/navigation";
import { type ListenAwards, reportAwards } from "@/modules/notices";
import { getPlayer } from "@/modules/player";
import { PreviewPlayer, type PreviewState } from "../preview-player";
import type { FeedItem, FeedPage } from "../types";
import { FeedCard } from "./feed-card";

const IDLE: PreviewState = { trackId: null, status: "idle", position: 0, length: 0 };
/** Load the next page when this many cards are left. */
const PREFETCH_AT = 3;
const EVENT_FLUSH_MS = 5000;
const noopSubscribe = () => () => undefined;
const idle = () => IDLE;

type FeedEvent = {
  name: string;
  track?: string;
  artist?: string;
  mode?: string;
  position?: number;
  reason?: string;
  ms?: number;
};

/**
 * The Discover feed: full-height cards, one preview at a time. Scroll, swipe or use ↑/↓; the
 * first tap starts sound, after that each card plays as it arrives and the feed moves on when a
 * preview ends. Signed-in listeners' listens earn discovery points; visitors just listen.
 */
export function DiscoverFeed({ initial }: { initial: FeedPage }) {
  const t = useTranslations("Feed");
  const locale = useLocale();
  const [items, setItems] = useState<FeedItem[]>(initial.items);
  const [mode, setMode] = useState<DiscoveryMode>(initial.mode);
  const [done, setDone] = useState(initial.done);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const [started, setStarted] = useState(false);
  const [player] = useState(() => (typeof window === "undefined" ? null : new PreviewPlayer()));
  const signedIn = initial.signedIn;

  const container = useRef<HTMLDivElement>(null);
  const events = useRef<FeedEvent[]>([]);
  // Latest values for callbacks that outlive a render (observer, player, timers).
  const latest = useRef({ items, mode, started, done, loading, failed, page: 1 });
  useEffect(() => {
    Object.assign(latest.current, { items, mode, started, done, loading, failed });
  }, [items, mode, started, done, loading, failed]);

  const preview = useSyncExternalStore(
    player?.subscribe ?? noopSubscribe,
    player?.getState ?? idle,
    idle,
  );

  // --- product events (signed-in only; batched) -------------------------------------------------
  const flushEvents = useCallback(() => {
    if (!signedIn || !events.current.length) return;
    const batch = events.current.splice(0, 50);
    void fetch("/api/discover/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    }).catch(() => undefined);
  }, [signedIn]);

  const track = useCallback(
    (name: string, item: FeedItem | undefined, extra: Partial<FeedEvent> = {}) => {
      if (!signedIn || !item) return;
      events.current.push({
        name,
        track: item.trackId,
        artist: item.artist.id,
        mode: latest.current.mode,
        position: latest.current.items.indexOf(item),
        reason: item.reason.code,
        ...extra,
      });
    },
    [signedIn],
  );

  useEffect(() => {
    const timer = setInterval(flushEvents, EVENT_FLUSH_MS);
    window.addEventListener("pagehide", flushEvents);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", flushEvents);
      flushEvents();
    };
  }, [flushEvents]);

  // --- paging -------------------------------------------------------------------------------------
  const load = useCallback(
    async (nextMode: DiscoveryMode, reset: boolean) => {
      const state = latest.current;
      if (state.loading) return;
      state.loading = true;
      setLoading(true);
      setFailed(false);
      const params = new URLSearchParams({
        mode: nextMode,
        seed: String(initial.seed + state.page),
        locale,
      });
      if (!reset && state.items.length) {
        params.set(
          "exclude",
          state.items
            .slice(-200)
            .map((i) => i.trackId)
            .join(","),
        );
      }
      try {
        const response = await fetch(`/api/discover/feed?${params}`, { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const next = (await response.json()) as FeedPage;
        state.page += 1;
        setItems((current) => {
          if (reset) return next.items;
          const seen = new Set(current.map((i) => i.trackId));
          return [...current, ...next.items.filter((i) => !seen.has(i.trackId))];
        });
        setDone(next.done);
      } catch {
        setFailed(true);
      } finally {
        state.loading = false;
        setLoading(false);
      }
    },
    [initial.seed, locale],
  );

  const prefetch = useCallback(
    (index: number) => {
      const state = latest.current;
      if (
        !state.done &&
        !state.loading &&
        !state.failed &&
        state.items.length - index <= PREFETCH_AT
      ) {
        void load(state.mode, false);
      }
    },
    [load],
  );

  const scrollTo = useCallback((index: number) => {
    const card = container.current?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    card?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const changeMode = (next: DiscoveryMode) => {
    if (next === mode) return;
    player?.pause();
    player?.finishSession();
    setMode(next);
    latest.current.mode = next;
    setActive(0);
    setDone(false);
    container.current?.scrollTo({ top: 0 });
    void load(next, true);
  };

  // --- the preview player's callbacks -----------------------------------------------------------
  useEffect(() => {
    player?.setCallbacks({
      onStarted: (trackId) => {
        const main = getPlayer();
        if (main.getState().status === "playing") main.pause();
        track(
          "preview_started",
          latest.current.items.find((i) => i.trackId === trackId),
        );
      },
      onEnded: (trackId) => {
        const index = latest.current.items.findIndex((i) => i.trackId === trackId);
        if (index !== -1 && index + 1 < latest.current.items.length) {
          setTimeout(() => scrollTo(index + 1), 500);
        }
      },
      onLeave: (listen) => {
        const item = latest.current.items.find((i) => i.trackId === listen.trackId);
        if (listen.completed) track("preview_completed", item, { ms: listen.msPlayed });
        else if (PreviewPlayer.isSkip(listen)) track("song_skipped", item, { ms: listen.msPlayed });
        if (!signedIn || listen.msPlayed < 1000) return;
        void fetch("/api/listen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trackId: listen.trackId,
            startedAt: listen.startedAt,
            msPlayed: listen.msPlayed,
            completed: listen.completed,
            tier: null,
            soundcheck: true,
          }),
          keepalive: true,
        })
          .then(async (response) =>
            response.ok ? ((await response.json()) as ListenAwards) : null,
          )
          .then(reportAwards)
          .catch(() => undefined);
      },
    });
  }, [player, scrollTo, signedIn, track]);

  useEffect(() => () => player?.destroy(), [player]);

  // The main player taking over (Play full song, the player bar) silences the preview.
  useEffect(() => {
    const main = getPlayer();
    const unsubscribe = main.subscribe(() => {
      if (main.getState().status === "playing") player?.pause();
    });
    return () => {
      unsubscribe();
    };
  }, [player]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      player?.pause();
      player?.finishSession();
      flushEvents();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [player, flushEvents]);

  // The feed fills the screen between the header and the bottom bar (whatever their height).
  useEffect(() => {
    const feed = container.current?.parentElement;
    const header = document.querySelector<HTMLElement>(".site-header");
    const bottom = document.querySelector<HTMLElement>(".site-bottom");
    if (!feed || !header || !bottom) return;
    const measure = () => {
      feed.style.setProperty("--feed-top", `${header.offsetHeight}px`);
      feed.style.setProperty("--feed-bottom", `${bottom.offsetHeight}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    observer.observe(bottom);
    return () => observer.disconnect();
  }, []);

  // --- which card is current ------------------------------------------------------------------
  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number((entry.target as HTMLElement).dataset.index);
          setActive(index);
          prefetch(index);
        }
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll("[data-index]").forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [items, prefetch]);

  // The current card plays (after the first tap); the next one is preloaded, older ones unloaded.
  const activeId = items[active]?.trackId;
  const nextId = items[active + 1]?.trackId;
  useEffect(() => {
    const item = latest.current.items.find((i) => i.trackId === activeId);
    if (!item || !player) return;
    track("song_impression", item);
    void player.show(item, null, latest.current.started);
  }, [activeId, player, track]);

  useEffect(() => {
    const item = latest.current.items.find((i) => i.trackId === activeId);
    const next = latest.current.items.find((i) => i.trackId === nextId);
    if (item && next && player) void player.show(item, next, false);
  }, [activeId, nextId, player]);

  const toggle = () => {
    setStarted(true);
    latest.current.started = true;
    void player?.toggle();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, dialog")) return;
    if (event.key === "ArrowDown" || event.key === "j") {
      event.preventDefault();
      scrollTo(Math.min(active + 1, items.length - 1));
    } else if (event.key === "ArrowUp" || event.key === "k") {
      event.preventDefault();
      scrollTo(Math.max(active - 1, 0));
    } else if (event.key === " " && target.tagName !== "BUTTON" && target.tagName !== "A") {
      event.preventDefault();
      toggle();
    }
  };

  return (
    <section className="feed" aria-label={t("title")} onKeyDown={onKeyDown}>
      <h1 className="visually-hidden">{t("title")}</h1>
      <nav className="feed-modes" aria-label={t("modeLabel")}>
        {DISCOVERY_MODES.map((m) => (
          <button
            key={m}
            type="button"
            className="feed-modes__chip"
            aria-pressed={m === mode}
            onClick={() => changeMode(m)}
          >
            {t(`modes.${m}`)}
          </button>
        ))}
        <Link href="/browse" className="feed-modes__chip feed-modes__chip--link">
          {t("browse")}
        </Link>
        <Link href="/welcome" className="feed-modes__chip feed-modes__chip--settings">
          {t("preferences")}
        </Link>
      </nav>

      <div ref={container} className="feed__cards" tabIndex={-1}>
        {items.map((item, index) => (
          <FeedCard
            key={item.trackId}
            item={item}
            index={index}
            count={items.length}
            active={index === active}
            preview={preview.trackId === item.trackId ? preview : null}
            started={started}
            onToggle={toggle}
            onNext={index + 1 < items.length ? () => scrollTo(index + 1) : undefined}
            onEvent={(name) => track(name, item)}
            signedIn={signedIn}
          />
        ))}
        <div className="feed__end" role="status">
          {loading ? (
            <p>{t("loading")}</p>
          ) : failed ? (
            <p>
              {t("failed")}{" "}
              <button type="button" className="button" onClick={() => void load(mode, false)}>
                {t("retry")}
              </button>
            </p>
          ) : done ? (
            <div className="feed__done">
              <p>{items.length ? t("end", { mode: t(`modes.${mode}`) }) : t("empty")}</p>
              <div className="feed__done-modes">
                {DISCOVERY_MODES.filter((m) => m !== mode).map((m) => (
                  <button key={m} type="button" className="button" onClick={() => changeMode(m)}>
                    {t(`modes.${m}`)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
