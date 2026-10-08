import { expect, test } from "@playwright/test";
import { createConfirmedUser, enableMfa, grantRole } from "./helpers";

/** A datetime-local value in Polish time, `hours` from now. */
function warsawLocal(hours: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Warsaw",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(Date.now() + hours * 3600_000))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

test("an artist adds gigs, a moderator publishes them, a listener finds them and was there", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  await createConfirmedUser(page, "gig-artist");
  await page.goto("/artysci/nowy");
  await page.getByLabel("Nazwa artysty").fill(`Scena ${run}`);
  await page.getByLabel("Adres profilu").fill(`scena-${run}`);
  await page.getByRole("button", { name: "Załóż profil" }).click();
  await expect(page).toHaveURL(new RegExp(`/artysci/scena-${run}/zarzadzaj$`));

  const gigs = page.locator("section.settings-form__group", {
    has: page.getByRole("heading", { name: "Koncerty" }),
  });
  const addGig = async (title: string, hours: number, lineup = "") => {
    await gigs.getByLabel("Nazwa wydarzenia").fill(title);
    await gigs.getByLabel("Data i godzina").fill(warsawLocal(hours));
    await gigs.getByLabel("Nazwa klubu lub miejsca").fill(`Klub ${run}`);
    await gigs.getByLabel("Miasto koncertu").fill("Gliwice");
    await gigs.getByLabel("Województwo").selectOption("slaskie");
    await gigs.getByLabel("Kto jeszcze gra (opcjonalnie)").fill(lineup);
    await gigs.getByRole("button", { name: "Dodaj koncert" }).click();
  };
  await addGig(`Teraz ${run}`, -1, "nie-ma-takiego-artysty");
  await expect(gigs.getByRole("alert")).toHaveText(
    "Któryś adres profilu nie należy do aktywnego artysty w Tunewick.",
  );
  await addGig(`Teraz ${run}`, -1);
  await expect(gigs.getByRole("status")).toHaveText(
    "Dodano. Koncert czeka na sprawdzenie przez moderatora.",
  );
  await addGig(`Za tydzień ${run}`, 24 * 7);
  await expect(gigs.getByText("czeka na moderację")).toHaveCount(2);

  // Not public before moderation.
  const listenerContext = await browser.newContext({ locale: "pl-PL" });
  const listener = await listenerContext.newPage();
  await createConfirmedUser(listener, "gig-listener");
  await listener.goto("/scena?woj=slaskie");
  await expect(listener.getByRole("link", { name: `Teraz ${run}` })).toHaveCount(0);

  const staffContext = await browser.newContext({ locale: "pl-PL" });
  const moderator = await staffContext.newPage();
  grantRole(await createConfirmedUser(moderator, "gig-moderator"), "moderator");
  await moderator.goto("/moderacja");
  await enableMfa(moderator);
  await moderator.goto("/moderacja");
  await moderator.getByRole("button", { name: `Opublikuj: Teraz ${run}` }).click();
  await expect(moderator.getByRole("button", { name: `Opublikuj: Teraz ${run}` })).toHaveCount(0);
  await moderator.getByRole("button", { name: `Opublikuj: Za tydzień ${run}` }).click();
  await expect(moderator.getByRole("button", { name: `Opublikuj: Za tydzień ${run}` })).toHaveCount(
    0,
  );

  // The listener finds them on the Scene, by voivodeship.
  await listener.goto("/scena?woj=slaskie");
  await expect(listener.getByRole("link", { name: `Za tydzień ${run}` })).toBeVisible();
  await listener.goto("/scena?woj=podlaskie");
  await expect(listener.getByRole("link", { name: `Za tydzień ${run}` })).toHaveCount(0);

  // A future gig: "I was there" is not open yet.
  await listener.goto("/scena?woj=slaskie");
  await listener.getByRole("link", { name: `Za tydzień ${run}` }).click();
  await expect(listener.getByText(/^Od rozpoczęcia koncertu przez 30 dni/)).toBeVisible();
  await listener.getByRole("link", { name: `Klub ${run}` }).click();
  await expect(listener.getByRole("heading", { level: 1 })).toHaveText(`Klub ${run}`);
  await expect(listener.getByText("Miejsce dodane przez artystę")).toBeVisible();

  // A gig that has started: mark it, find it in the library.
  await listener.getByRole("link", { name: `Teraz ${run}` }).click();
  await expect(listener.getByRole("link", { name: `Scena ${run}` })).toBeVisible();
  await listener.getByRole("button", { name: "Byłem przy tym" }).click();
  await expect(listener.getByRole("button", { name: "Byłem przy tym ✓" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await listener.goto("/biblioteka");
  const history = listener.locator("section", {
    has: listener.getByRole("heading", { name: "Byłem przy tym" }),
  });
  await expect(history.getByRole("link", { name: `Teraz ${run}` })).toBeVisible();

  // The artist's page lists the upcoming gig.
  await page.goto(`/artysci/scena-${run}`);
  const upcoming = page.locator("section", {
    has: page.getByRole("heading", { name: "Najbliższe koncerty" }),
  });
  await expect(upcoming.getByRole("link", { name: `Za tydzień ${run}` })).toBeVisible();

  await listenerContext.close();
  await staffContext.close();
});
