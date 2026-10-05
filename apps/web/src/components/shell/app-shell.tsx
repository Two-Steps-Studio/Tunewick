import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./locale-switcher";
import { MainNav } from "./main-nav";
import { PlayerBar } from "./player-bar";
import { Wordmark } from "./wordmark";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("Shell");

  return (
    <>
      <a href="#main" className="skip-link">
        {t("skipToContent")}
      </a>
      <header className="site-header">
        <Link href="/" className="site-header__home" aria-label={t("home")}>
          <Wordmark />
        </Link>
        <MainNav variant="top" />
        <LocaleSwitcher />
      </header>
      <main id="main" tabIndex={-1} className="site-main">
        {children}
      </main>
      <div className="site-bottom">
        <PlayerBar />
        <MainNav variant="bottom" />
      </div>
    </>
  );
}
