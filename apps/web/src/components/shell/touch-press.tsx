"use client";

import { useEffect } from "react";

/**
 * iOS Safari applies :active (our press feedback) only when the page listens to touches. One
 * passive, empty listener makes buttons react the moment a finger lands, like native controls.
 */
export function TouchPress() {
  useEffect(() => {
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });
    return () => document.removeEventListener("touchstart", noop);
  }, []);
  return null;
}
