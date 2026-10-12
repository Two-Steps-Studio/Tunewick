import { expect, type Page, test } from "@playwright/test";
import { createConfirmedUser } from "./helpers";

function uniqueHandle(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

async function setHandle(page: Page, handle: string, name: string) {
  await page.goto("/ustawienia");
  await page.getByLabel("Nazwa profilu (adres)").fill(handle);
  await page.getByLabel("Nazwa wyświetlana").fill(name);
  await page.getByRole("button", { name: "Zapisz zmiany" }).click();
  await expect(page.getByRole("status")).toHaveText("Zapisano.");
}

test("friends rank together; a private score leaves the ranking and the profile", async ({
  page,
  browser,
}) => {
  await createConfirmedUser(page, "friends-ola");
  const ola = uniqueHandle("ola");
  await setHandle(page, ola, "Ola");

  const other = await browser.newContext({ locale: "pl-PL" });
  const kubaPage = await other.newPage();
  await createConfirmedUser(kubaPage, "friends-kuba");
  await setHandle(kubaPage, uniqueHandle("kuba"), "Kuba");

  // Kuba follows Ola: both are in his ranking, and her profile shows her discovery side.
  await kubaPage.goto(`/profil/${ola}`);
  await expect(kubaPage.getByRole("region", { name: "Odkrywanie" })).toContainText(
    "Discovery Score",
  );
  await kubaPage.getByRole("button", { name: "Obserwuj: Ola" }).click();
  await expect(kubaPage.getByRole("button", { name: "Przestań obserwować: Ola" })).toBeVisible();
  await kubaPage.goto("/ty/znajomi");
  const ranking = kubaPage.getByRole("region", { name: "Ranking wśród znajomych" });
  await expect(ranking.getByRole("listitem")).toHaveCount(2);
  await expect(ranking.getByRole("link", { name: "Ola" })).toBeVisible();

  // Ola keeps her score to herself.
  await page.goto("/ustawienia");
  await page.getByLabel("Discovery Score i ranking wśród znajomych").selectOption("private");
  await page.getByRole("button", { name: "Zapisz prywatność" }).click();
  await expect(page.getByText("Zapisano.")).toBeVisible();

  await kubaPage.reload();
  await expect(ranking.getByRole("link", { name: "Ola" })).toHaveCount(0);
  await kubaPage.goto(`/profil/${ola}`);
  await expect(kubaPage.getByRole("region", { name: "Odkrywanie" })).not.toContainText(
    "Discovery Score",
  );
  await other.close();
});
