import { expect, test } from "@playwright/test";
import { createConfirmedUser, solidPng } from "./helpers";

// Needs local S3 and the worker (pnpm media:start, pnpm worker:start): images are processed there.

test.describe("covers and artist photos", () => {
  test.setTimeout(150_000);

  test("a cover is checked and re-encoded; the artist photo shows on the profile", async ({
    page,
    browser,
  }) => {
    await createConfirmedUser(page, "images");
    const slug = `img-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    await page.goto("/artysci/nowy");
    await page.getByLabel("Nazwa artysty").fill("Pracownia Okładek");
    await page.getByLabel("Adres profilu").fill(slug);
    await page.getByRole("button", { name: "Załóż profil" }).click();
    await expect(page).toHaveURL(new RegExp(`/artysci/${slug}/zarzadzaj$`));

    // Artist photo: centre-cropped and shown on the public profile.
    await expect(page.getByLabel("Dodaj zdjęcie")).toBeEnabled();
    await page.getByLabel("Dodaj zdjęcie").setInputFiles({
      name: "zdjecie.png",
      mimeType: "image/png",
      buffer: solidPng(600, 800, [30, 90, 160]),
    });
    await expect(page.locator(".cover-editor img")).toBeVisible({ timeout: 60_000 });
    const visitor = await (await browser.newContext({ locale: "pl-PL" })).newPage();
    await visitor.goto(`/artysci/${slug}`);
    const photo = visitor.locator(".profile__photo img");
    await expect(photo).toHaveAttribute("alt", "Pracownia Okładek");
    await expect(photo).toHaveAttribute("src", /images%2F|images\//);
    expect(await photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

    // Cover: refused before upload when it is not an image type, refused by the worker when small.
    await page.getByRole("link", { name: "Nowe wydawnictwo" }).click();
    await page.getByLabel("Tytuł").fill("Okładkowy");
    await page.getByRole("button", { name: "Utwórz szkic" }).click();
    await expect(page.locator(".readiness__todo", { hasText: "Okładka" })).toBeVisible();

    await expect(page.getByLabel("Dodaj okładkę")).toBeEnabled();

    await page.getByLabel("Dodaj okładkę").setInputFiles({
      name: "logo.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    });
    await expect(page.locator(".image-upload").getByRole("alert")).toHaveText(
      "Ten typ pliku nie jest obsługiwany. Wybierz JPEG, PNG lub WebP.",
    );

    await expect(page.getByLabel("Dodaj okładkę")).toBeEnabled();

    await page.getByLabel("Dodaj okładkę").setInputFiles({
      name: "mala.png",
      mimeType: "image/png",
      buffer: solidPng(800, 800, [200, 40, 60]),
    });
    await expect(page.locator(".image-upload").getByRole("status")).toHaveText(
      "Okładka została odrzucona. Obraz jest za mały (okładka: min. 1400 × 1400 px, zdjęcie: min. 400 px, okładka playlisty: 600 px, baner: 1200 × 400 px).",
      { timeout: 60_000 },
    );

    await expect(page.getByLabel("Dodaj okładkę")).toBeEnabled();

    await page.getByLabel("Dodaj okładkę").setInputFiles({
      name: "okladka.png",
      mimeType: "image/png",
      buffer: solidPng(1500, 1500, [200, 40, 60]),
    });
    const cover = page.locator(".cover-editor .artwork img");
    await expect(cover).toBeVisible({ timeout: 60_000 });
    await expect(cover).toHaveAttribute("srcset", /160w.*1500w/);
    // The placeholder colour is the cover's dominant colour.
    await expect(page.locator(".cover-editor .artwork")).toHaveCSS(
      "background-color",
      "rgb(200, 40, 60)",
    );
    await expect(page.locator(".readiness__done", { hasText: "Okładka" })).toBeVisible();
    await expect(page.getByLabel("Zmień okładkę")).toBeAttached();
  });
});

test.describe("art by listeners", () => {
  test.setTimeout(150_000);

  test("a listener adds a profile banner and their own playlist cover", async ({
    page,
    browser,
  }) => {
    await createConfirmedUser(page, "art");
    const handle = `art-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    await page.goto("/ustawienia");
    await page.getByLabel("Nazwa profilu (adres)").fill(handle);
    await page.getByRole("button", { name: "Zapisz zmiany" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Zapisano." })).toBeVisible();

    // Banner: wide, centre-cropped to 3:1, shown across the top of the public profile.
    await expect(page.getByLabel("Dodaj baner")).toBeEnabled();
    await page.getByLabel("Dodaj baner").setInputFiles({
      name: "baner.png",
      mimeType: "image/png",
      buffer: solidPng(1500, 600, [40, 120, 90]),
    });
    await expect(page.locator(".banner img")).toBeVisible({ timeout: 60_000 });
    const visitor = await (await browser.newContext({ locale: "pl-PL" })).newPage();
    await visitor.goto(`/profil/${handle}`);
    const banner = visitor.locator(".banner img");
    await expect(banner).toBeVisible();
    const size = await banner.evaluate((img: HTMLImageElement) => [
      img.naturalWidth,
      img.naturalHeight,
    ]);
    // 3:1, give or take the pixel a resize rounds.
    expect(Math.abs(size[0]! - size[1]! * 3)).toBeLessThanOrEqual(3);

    // Playlist cover: the listener's own art instead of the release mosaic.
    await page.goto("/biblioteka");
    await page.getByLabel("Nowa playlista").fill("Moje okładki");
    await page.getByRole("button", { name: "Utwórz", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Moje okładki");
    await expect(page.getByLabel("Dodaj własną okładkę")).toBeEnabled();
    await page.getByLabel("Dodaj własną okładkę").setInputFiles({
      name: "okladka.png",
      mimeType: "image/png",
      buffer: solidPng(700, 700, [180, 60, 140]),
    });
    await expect(page.locator(".release-page__cover img")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Wróć do mozaiki okładek" })).toBeVisible();
  });
});
