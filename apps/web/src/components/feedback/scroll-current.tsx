"use client";

import { useEffect, useRef } from "react";

/** A horizontally scrolling nav that brings its current item (aria-current) into view. */
export function ScrollCurrent({
  className,
  label,
  children,
}: {
  className: string;
  label: string;
  children: React.ReactNode;
}) {
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    nav.current
      ?.querySelector<HTMLElement>("[aria-current]")
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, []);
  return (
    <nav ref={nav} className={className} aria-label={label}>
      {children}
    </nav>
  );
}
