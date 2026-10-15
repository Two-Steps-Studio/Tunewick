import { expect, test } from "@playwright/test";
import { createConfirmedUser, expectNoSidewaysScroll, localAdmin } from "./helpers";

// A release approved with a future date: before the day its page is a premiere page (countdown,
// "Remind me", no music) and the artist page lists it as upcoming.
test("a scheduled release has a premiere page with a countdown and reminders", async ({
  page,
  browser,
}) => {
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const db = localAdmin();
  const { data: artist, error } = await db
    .from("artists")
    .insert({ slug: `premiera-${run}`, name: `Premiera ${run}` })
    .select("id")
    .single();
  if (error) throw error;
  const inThreeDays = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const { error: releaseError } = await db.from("releases").insert({
    artist_id: artist.id,
    slug: "wkrotce",
    title: "Wkrótce",
    type: "single",
    status: "published",
    publish_at: inThreeDays,
  });
  if (releaseError) throw releaseError;

  // A visitor: the premiere page, the countdown ticking, sign in to be reminded.
  const visitor = await (await browser.newContext({ locale: "pl-PL" })).newPage();
  const path = `/artysci/premiera-${run}/wydawnictwa/wkrotce`;
  const response = await visitor.goto(path);
  expect(response?.status()).toBe(200);
  await expect(visitor.getByRole("heading", { level: 1 })).toHaveText("Wkrótce");
  await expect(visitor.getByText("Premiera", { exact: true })).toBeVisible();
  await expect(visitor.getByRole("timer")).toContainText("dni");
  await expect(
    visitor.getByRole("link", { name: "Zaloguj się, żeby dostać przypomnienie" }),
  ).toBeVisible();
  // No music before the day.
  await expect(visitor.getByRole("button", { name: /^Odtwórz/ })).toHaveCount(0);
  await expectNoSidewaysScroll(visitor);

  // The artist page lists it as upcoming.
  await visitor.goto(`/artysci/premiera-${run}`);
  const upcoming = visitor.locator(".discover__section", {
    has: visitor.getByRole("heading", { name: "Nadchodzące premiery" }),
  });
  await upcoming.getByRole("link", { name: /Wkrótce/ }).click();
  await expect(visitor).toHaveURL(new RegExp(`${path}$`));

  // A listener asks to be reminded; it is remembered.
  await createConfirmedUser(page, "premiere");
  await page.goto(path);
  await page.getByRole("button", { name: "Przypomnij mi" }).click();
  await expect(page.getByRole("button", { name: "Przypomnę Ci" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // Saved on the server (the hint confirms it), then still there after a reload.
  await expect(page.getByText(/^W dniu premiery znajdziesz je w Bibliotece/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Przypomnę Ci" })).toBeVisible();
  await expect(page.getByText("1 osoba czeka na premierę")).toBeVisible();
});
