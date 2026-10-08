import { createNavigation } from "next-intl/navigation";
import { routing, type StaticPathname } from "./routing";

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);

type Href = Parameters<typeof getPathname>[0]["href"];

/**
 * `{ pathname, query }` for a static pathname that is only known as a union. TypeScript relates an
 * object with a union-typed property to a union of objects only up to 25 members, and the app has
 * more static pathnames than that — every member is valid, so the cast is sound.
 */
export function staticHref(pathname: StaticPathname, query?: Record<string, string>): Href {
  return (query ? { pathname, query } : pathname) as Href;
}
