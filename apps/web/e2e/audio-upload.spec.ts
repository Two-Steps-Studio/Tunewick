import { expect, type Page, test } from "@playwright/test";
import { createConfirmedUser } from "./helpers";

// Requires local S3 (pnpm media:start, then pnpm db:env) — the browser uploads straight to it.

function unique(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** A tiny valid WAV: 1 s of 16-bit stereo silence at 44.1 kHz. */
function silentWav(seconds = 1) {
  const rate = 44100;
  const dataBytes = rate * seconds * 4;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(2, 22); // stereo
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);
  return buffer;
}

async function draftWithTrack(page: Page) {
  await createConfirmedUser(page, "audio-owner");
  const slug = unique("aud");
  await page.goto("/artysci/nowy");
  await page.getByLabel("Nazwa artysty").fill("Kopalnia Dźwięku");
  await page.getByLabel("Adres profilu").fill(slug);
  await page.getByRole("button", { name: "Załóż profil" }).click();
  await expect(page).toHaveURL(new RegExp(`/artysci/${slug}/zarzadzaj$`));
  await page.getByRole("link", { name: "Nowe wydawnictwo" }).click();
  await page.getByLabel("Tytuł").fill("Szyb");
  await page.getByRole("button", { name: "Utwórz szkic" }).click();
  await expect(page).toHaveURL(new RegExp(`/artysci/${slug}/wydawnictwa/szyb$`));
  await page.getByLabel("Tytuł utworu").fill("Hałda");
  await page.getByRole("button", { name: "Dodaj utwór" }).click();
  await expect(page.locator(".track-item__title")).toHaveText(["Hałda"]);
}

test.describe("master upload", () => {
  test.setTimeout(90_000);

  test("uploads a lossless master straight to storage and shows an honest status", async ({
    page,
  }) => {
    await draftWithTrack(page);
    const track = page.locator(".track-item").first();
    await expect(track.getByText("Brak pliku master.")).toBeVisible();
    await expect(
      page.locator(".readiness__todo", { hasText: /^✗ Pliki master wszystkich utworów$/ }),
    ).toBeVisible();

    // Lossy files are refused before anything is sent.
    await track.getByLabel("Wybierz plik master: Hałda").setInputFiles({
      name: "singiel.mp3",
      mimeType: "audio/mpeg",
      buffer: Buffer.alloc(4096),
    });
    await expect(track.getByRole("alert")).toHaveText(/nie jest obsługiwany/);

    await track.getByLabel("Wybierz plik master: Hałda").setInputFiles({
      name: "Halda Master.wav",
      mimeType: "audio/wav",
      buffer: silentWav(),
    });
    await expect(track.getByRole("status")).toHaveText(
      /Przesłano Halda Master\.wav \(0,2 MB\) — czeka na sprawdzenie i przetworzenie\./,
    );
    // Not "done": nothing has checked the file yet.
    await expect(
      page.locator(".readiness__todo", { hasText: "Pliki master przesłane — czekają" }),
    ).toBeVisible();

    // A replacement starts a new upload; the newest one is shown.
    await track.getByLabel("Prześlij nowy plik: Hałda").setInputFiles({
      name: "Halda v2.flac",
      mimeType: "audio/flac",
      buffer: silentWav(2),
    });
    await expect(track.getByRole("status")).toHaveText(/Przesłano Halda v2\.flac/);
  });
});
