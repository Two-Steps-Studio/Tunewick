"use client";

import { useLinkStatus } from "next/link";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import type { AppPathname } from "@/i18n/routing";

// Discover is the center: one tap from anywhere to new music.
const items = [
  { href: "/", key: "discover" },
  { href: "/scene", key: "scene" },
  { href: "/search", key: "search" },
  { href: "/library", key: "library" },
  { href: "/you", key: "you" },
] as const satisfies ReadonlyArray<{ href: AppPathname; key: string }>;

export function MainNav({ variant }: { variant: "top" | "bottom" }) {
  const t = useTranslations("Nav");
  const tShell = useTranslations("Shell");
  const pathname = usePathname();

  return (
    <nav aria-label={tShell("mainNav")} className={`main-nav main-nav--${variant}`}>
      <ul>
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className="main-nav__link"
                aria-current={active ? "page" : undefined}
              >
                {t(item.key)}
                <PendingMark />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Tapped, next page still rendering on the server: a line grows under the item, so the tap is
 * answered at once. Always rendered (no layout shift); CSS delays it so fast navigations never
 * flash it.
 */
function PendingMark() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className="main-nav__pending" data-pending={pending || undefined} />;
}
