import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createConfirmedUser, signIn } from "./helpers";

test("a person downloads their data and deletes their account", async ({ page }) => {
  const email = await createConfirmedUser(page, "privacy");
  await page.goto("/ustawienia");
  const data = page.locator("section", { has: page.getByRole("heading", { name: "Twoje dane" }) });

  // Export (GDPR art. 15/20): one JSON file with the account and everything around it.
  const download = page.waitForEvent("download");
  await data.getByRole("link", { name: "Pobierz moje dane" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^tunewick-dane-\d{4}-\d{2}-\d{2}\.json$/);
  const exported = JSON.parse(readFileSync((await file.path())!, "utf8"));
  expect(exported.account.email).toBe(email);
  expect(exported).toHaveProperty("listening_history");
  expect(exported).toHaveProperty("playlists");

  // Delete (art. 17): the email must match; afterwards the account cannot sign in.
  await data.getByRole("button", { name: "Usuń konto" }).click();
  await data.getByLabel("Adres e-mail konta").fill("ktos-inny@example.com");
  await data.getByRole("button", { name: "Usuń konto na zawsze" }).click();
  await expect(data.getByRole("alert")).toHaveText("To nie jest adres e-mail tego konta.");
  await data.getByLabel("Adres e-mail konta").fill(email);
  await data.getByRole("button", { name: "Usuń konto na zawsze" }).click();
  await expect(page).toHaveURL(/\/\?konto=usuniete$/);
  await expect(
    page.getByText("Konto zostało usunięte. Dziękujemy za wspólny czas w Tunewick."),
  ).toBeVisible();
  await expect(page.getByRole("banner").getByRole("link", { name: "Zaloguj się" })).toBeVisible();

  await signIn(page, email);
  await expect(page.locator("form [role=alert]")).toHaveText("Nieprawidłowy e-mail lub hasło.");
});

test("the only owner of an artist profile hands it over first", async ({ page }) => {
  await createConfirmedUser(page, "privacy-owner");
  const slug = `solo-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  await page.goto("/artysci/nowy");
  await page.getByLabel("Nazwa artysty").fill(`Solo ${slug}`);
  await page.getByLabel("Adres profilu").fill(slug);
  await page.getByRole("button", { name: "Załóż profil" }).click();
  await expect(page).toHaveURL(new RegExp(`/artysci/${slug}/zarzadzaj$`));
  // No closed month yet: the listener numbers say so instead of showing zeros.
  await expect(
    page.getByText("Pierwszy miesiąc zamknie się 2. dnia kolejnego miesiąca."),
  ).toBeVisible();

  await page.goto("/ustawienia");
  const data = page.locator("section", { has: page.getByRole("heading", { name: "Twoje dane" }) });
  await expect(
    data.getByText(/^Najpierw dodaj innego właściciela do profili artystów/),
  ).toBeVisible();
  await expect(data.getByRole("link", { name: `Solo ${slug}` })).toBeVisible();
  await expect(data.getByRole("button", { name: "Usuń konto" })).toHaveCount(0);
});
