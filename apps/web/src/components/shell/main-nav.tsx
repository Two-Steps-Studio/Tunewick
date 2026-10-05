"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import type { AppPathname } from "@/i18n/routing";

const items = [
  { href: "/", key: "discover" },
  { href: "/scene", key: "scene" },
  { href: "/search", key: "search" },
  { href: "/library", key: "library" },
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
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
