"use client";

import type { QualitySetting, QualityTier } from "@tunewick/shared";
import { useEffect, useState } from "react";
import { getPlayer, type PlayerTrack } from "@/modules/player";

const SETTINGS: QualitySetting[] = ["auto", "hires", "lossless", "high", "data_saver"];

/** Developer page: drives the real engine with the worker-produced sweep album. English only. */
export function DevPlayer({ tracks }: { tracks: PlayerTrack[] }) {
  const [setting, setSetting] = useState<QualitySetting>("auto");
  const [entitlement, setEntitlement] = useState<QualityTier>("hires");
  const [debug, setDebug] = useState("");

  useEffect(() => {
    const timer = setInterval(() => {
      const player = getPlayer();
      const { status, index, position, duration, now, error } = player.getState();
      setDebug(
        JSON.stringify(
          { status, index, position, duration, tier: now?.tier, error, ...player.debug() },
          null,
          2,
        ),
      );
    }, 250);
    return () => clearInterval(timer);
  }, []);

  const play = (start: number) => {
    const player = getPlayer();
    player.configure({ setting, entitlement });
    void player.playQueue(tracks, start);
  };

  if (!tracks.length) {
    return (
      <section className="dev-player">
        <h1>Player test</h1>
        <p>
          No test album yet. Run <code>pnpm dev:media</code> (needs Docker) and reload.
        </p>
      </section>
    );
  }

  return (
    <section className="dev-player">
      <h1>Player test</h1>
      <p>
        One continuous sine sweep over pink noise, cut into three 10 s tracks and processed by the
        audio worker. A gap or click at 0:10 / 0:20 is a gapless bug.
      </p>
      <div className="dev-player__row">
        <label>
          Quality{" "}
          <select
            data-testid="setting"
            value={setting}
            onChange={(e) => setSetting(e.target.value as QualitySetting)}
          >
            {SETTINGS.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Plan{" "}
          <select
            data-testid="entitlement"
            value={entitlement}
            onChange={(e) => setEntitlement(e.target.value as QualityTier)}
          >
            <option value="hires">Premium (Hi-Res)</option>
            <option value="high">Free (High)</option>
          </select>
        </label>
        <button type="button" className="button button--primary" onClick={() => play(0)}>
          Play album
        </button>
        <button type="button" className="button button--quiet" onClick={() => play(1)}>
          Play from track 2
        </button>
      </div>
      <pre data-testid="player-debug" className="dev-player__debug">
        {debug}
      </pre>
    </section>
  );
}
