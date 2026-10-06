import { expect, type Page, test } from "@playwright/test";
import { createConfirmedUser, enableMfa, grantRole, solidPng } from "./helpers";

// The whole path to listeners: artist → moderator (role + MFA) → anonymous listener.
// Needs local S3 and the audio worker (pnpm media:start, pnpm worker:start).

function toneWav(seconds: number) {
  const rate = 44100;
  const dataBytes = rate * seconds * 4;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < rate * seconds; i++) {
    const sample = Math.round(Math.sin((2 * Math.PI * 330 * i) / rate) * 8000);
    buffer.writeInt16LE(sample, 44 + i * 4);
    buffer.writeInt16LE(sample, 46 + i * 4);
  }
  return buffer;
}

async function readyRelease(page: Page) {
  await createConfirmedUser(page, "publish-artist");
  const slug = `pub-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  await page.goto("/artysci/nowy");
  // Unique per run: the local database is shared with other (and earlier) test runs.
  await page.getByLabel("Nazwa artysty").fill(`Familok ${slug}`);
  await page.getByLabel("Adres profilu").fill(slug);
  await page.getByRole("button", { name: "Załóż profil" }).click();
  await page.getByRole("link", { name: "Nowe wydawnictwo" }).click();
  await page.getByLabel("Tytuł").fill("Szychta");
  await page.getByRole("button", { name: "Utwórz szkic" }).click();
  await expect(page).toHaveURL(new RegExp(`/artysci/${slug}/wydawnictwa/szychta/edytuj$`));

  await page.getByLabel("Tytuł utworu").fill("Nocna zmiana");
  await page.getByRole("button", { name: "Dodaj utwór" }).click();
  await expect(page.locator(".track-item__title")).toHaveText(["Nocna zmiana"]);

  const rights = page.locator("form", {
    has: page.getByRole("button", { name: "Złóż oświadczenie" }),
  });
  await rights.getByLabel("Mam (lub mamy) prawa do nagrań").check();
  await rights.getByLabel(/Autorzy muzyki i tekstów/).check();
  await rights.getByRole("checkbox", { name: "Nie, nikt nie należy" }).check();
  await rights.getByLabel("Udział sztucznej inteligencji").selectOption("human");
  await rights.getByLabel(/Akceptuję warunki dla artystów/).check();
  await rights.getByRole("button", { name: "Złóż oświadczenie" }).click();
  await expect(page.locator(".declaration")).toContainText("Złożone oświadczenie");

  await page.getByLabel("Dodaj okładkę").setInputFiles({
    name: "szychta.png",
    mimeType: "image/png",
    buffer: solidPng(1400, 1400, [240, 200, 40]),
  });
  await expect(page.locator(".cover-editor .artwork img")).toBeVisible({ timeout: 60_000 });

  // No submit button until the master is checked.
  await expect(page.getByRole("button", { name: "Wyślij do weryfikacji" })).toHaveCount(0);
  await page.getByLabel("Wybierz plik master: Nocna zmiana").setInputFiles({
    name: "nocna-zmiana.wav",
    mimeType: "audio/wav",
    buffer: toneWav(12),
  });
  await expect(page.locator(".track-item").first().getByRole("status")).toHaveText(
    /^Gotowe: nocna-zmiana\.wav/,
    { timeout: 90_000 },
  );
  return slug;
}

test.describe("review and publishing", () => {
  test.setTimeout(240_000);

  test("artist submits, moderator returns then approves, a listener plays it", async ({
    page,
    browser,
  }) => {
    const slug = await readyRelease(page);
    const editor = page.url();
    const submission = `Familok ${slug} — Szychta`;

    await page.getByRole("button", { name: "Wyślij do weryfikacji" }).click();
    await expect(page.getByText(/^Wysłane do weryfikacji/)).toBeVisible();
    // Locked while in review: no upload or details forms.
    await expect(page.getByLabel(/Prześlij nowy plik/)).toHaveCount(0);

    // A not-yet-public release has no public page.
    const anonymous = await browser.newContext({ locale: "pl-PL" });
    const listener = await anonymous.newPage();
    expect((await listener.goto(`/artysci/${slug}/wydawnictwa/szychta`))?.status()).toBe(404);

    // The moderator: role from the admin script, then MFA (the panel requires both).
    const staffContext = await browser.newContext({ locale: "pl-PL" });
    const moderator = await staffContext.newPage();
    const moderatorEmail = await createConfirmedUser(moderator, "publish-moderator");
    grantRole(moderatorEmail, "moderator");
    await moderator.goto("/moderacja");
    await expect(moderator).toHaveURL(/\/ustawienia\/bezpieczenstwo$/);
    await enableMfa(moderator);

    await moderator.goto("/moderacja");
    await moderator.getByRole("link", { name: submission }).click();
    await expect(moderator.getByText("Bez AI — utworzone przez ludzi").first()).toBeVisible();
    await expect(moderator.getByText("WAV 16/44.1 · 0:12")).toBeVisible();

    await moderator.getByRole("button", { name: "Zwróć do poprawy" }).click();
    await expect(moderator.locator(".decision-form").getByRole("alert")).toHaveText(
      "Napisz artyście, co trzeba poprawić (co najmniej 10 znaków).",
    );
    await moderator.getByLabel("Uwagi dla artysty").fill("Dodaj datę wydania i linię ℗.");
    await moderator.getByRole("button", { name: "Zwróć do poprawy" }).click();
    await expect(moderator).toHaveURL(/\/moderacja$/);
    await expect(moderator.getByRole("link", { name: submission })).toHaveCount(0);

    // The artist sees why, fixes nothing in this test and sends it again.
    await page.goto(editor);
    await expect(page.getByText("Dodaj datę wydania i linię ℗.")).toBeVisible();
    await page.getByRole("button", { name: "Wyślij do weryfikacji" }).click();
    await expect(page.getByText(/^Wysłane do weryfikacji/)).toBeVisible();

    await moderator.goto("/moderacja");
    await moderator.getByRole("link", { name: submission }).click();
    await expect(moderator.getByText(/zwrócone do poprawy: Dodaj datę/)).toBeVisible();
    await moderator.getByRole("button", { name: "Zatwierdź i opublikuj" }).click();
    await expect(moderator).toHaveURL(/\/moderacja$/);

    // Published: the artist sees it, and anyone can listen (Free plan: High).
    await page.goto(editor);
    await expect(page.getByText(/^Opublikowane/)).toBeVisible();

    await listener.goto(`/artysci/${slug}`);
    await listener.getByRole("link", { name: "Szychta" }).click();
    await expect(listener).toHaveURL(new RegExp(`/artysci/${slug}/wydawnictwa/szychta$`));
    await expect(listener.getByRole("heading", { level: 1 })).toHaveText("Szychta");
    await expect(listener.getByRole("img", { name: /^Okładka: Szychta/ })).toBeVisible();
    await expect(listener.getByText("1 utwór · 0:12")).toBeVisible();
    await expect(listener.getByText("Bez AI — utworzone przez ludzi.")).toBeVisible();
    // A Free listener's page has no link to lossless files at all.
    expect(await listener.content()).not.toContain("lossless.flac");

    await listener.getByRole("button", { name: "Odtwórz: Nocna zmiana" }).click();
    const bar = listener.getByRole("region", { name: "Odtwarzacz" });
    await expect(bar.getByText("Nocna zmiana")).toBeVisible();
    await expect(bar.locator(".quality-chip")).toContainText("High");
    await expect(bar.getByRole("button", { name: "Pauza" })).toBeVisible();

    await anonymous.close();
    await staffContext.close();
  });
});
