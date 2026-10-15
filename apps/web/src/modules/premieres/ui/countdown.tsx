"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function parts(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/**
 * Time left until the premiere, ticking every second. At zero the page refreshes and the
 * release page (tracks, play) takes over. Rendered empty on the server: the time is the
 * visitor's clock, not the server's.
 */
export function Countdown({ at }: { at: string }) {
  const t = useTranslations("Premiere");
  const router = useRouter();
  const target = Date.parse(at);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= target) {
        clearInterval(timer);
        router.refresh();
      }
    };
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [target, router]);

  if (now === null) return <p className="countdown" aria-hidden="true" />;
  const left = parts(target - now);
  const units = [
    ["days", left.days],
    ["hours", left.hours],
    ["minutes", left.minutes],
    ["seconds", left.seconds],
  ] as const;
  return (
    <p className="countdown" role="timer" aria-label={t("timeLeft", left)}>
      {units.map(([unit, value]) => (
        <span key={unit} className="countdown__unit" aria-hidden="true">
          <span className="countdown__value">{String(value).padStart(2, "0")}</span>
          <span className="countdown__label">{t(`units.${unit}`)}</span>
        </span>
      ))}
    </p>
  );
}
