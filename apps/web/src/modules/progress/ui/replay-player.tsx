"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

const SCREEN_MS = 7000;

/**
 * Story player for Replay: one screen at a time with progress bars, tap left/right (or ←/→,
 * space to pause), auto-advance that pauses while held, on hover and when the tab is hidden.
 * With reduced motion there is no auto-advance. The screens are server-rendered.
 */
export function ReplayPlayer({
  screens,
  labels,
}: {
  screens: ReactNode[];
  labels: { previous: string; next: string; pause: string; play: string; screen: string };
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  // Focus follows the story only after the listener moved it (not on arrival, not on autoplay).
  const moved = useRef(false);
  const last = screens.length - 1;

  const go = useCallback(
    (to: number, byListener = true) => {
      moved.current = byListener;
      setIndex(Math.max(0, Math.min(last, to)));
      setElapsed(0);
    },
    [last],
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const running = !paused && !held && !reduced && index < last;
  useEffect(() => {
    if (!running) return;
    let previous = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      if (document.visibilityState === "visible") {
        setElapsed((value) => value + (now - previous));
      }
      previous = now;
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [running, index]);

  useEffect(() => {
    if (elapsed >= SCREEN_MS) go(index + 1, false);
  }, [elapsed, index, go]);

  useEffect(() => {
    if (!moved.current) return;
    root.current?.querySelector<HTMLElement>("[data-current] h2, [data-current] h1")?.focus();
  }, [index]);

  return (
    <div
      ref={root}
      className="replay"
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") go(index + 1);
        else if (event.key === "ArrowLeft") go(index - 1);
        else if (event.key === " ") {
          event.preventDefault();
          setPaused((value) => !value);
        }
      }}
    >
      <ol className="replay__bars" aria-hidden="true">
        {screens.map((_, i) => (
          <li key={i}>
            <span
              style={{
                transform: `scaleX(${i < index ? 1 : i > index ? 0 : reduced ? 1 : Math.min(1, elapsed / SCREEN_MS)})`,
              }}
            />
          </li>
        ))}
      </ol>
      <div
        className="replay__stage"
        onPointerDown={() => setHeld(true)}
        onPointerUp={() => setHeld(false)}
        onPointerLeave={() => setHeld(false)}
        onPointerCancel={() => setHeld(false)}
      >
        {screens.map((screen, i) => (
          <section
            key={i}
            className="replay__screen"
            data-current={i === index ? "" : undefined}
            hidden={i !== index}
            aria-roledescription={labels.screen}
            aria-label={`${i + 1} / ${screens.length}`}
          >
            {screen}
          </section>
        ))}
        <button
          type="button"
          className="replay__tap replay__tap--prev"
          aria-label={labels.previous}
          onClick={() => go(index - 1)}
          disabled={index === 0}
        />
        <button
          type="button"
          className="replay__tap replay__tap--next"
          aria-label={labels.next}
          onClick={() => go(index + 1)}
          disabled={index === last}
        />
      </div>
      <div className="replay__controls">
        <span className="replay__count">
          {index + 1} / {screens.length}
        </span>
        {!reduced ? (
          <button type="button" className="button" onClick={() => setPaused((value) => !value)}>
            {paused ? labels.play : labels.pause}
          </button>
        ) : null}
      </div>
    </div>
  );
}
