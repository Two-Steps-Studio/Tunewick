import { expect, type Page, test } from "@playwright/test";
import { createConfirmedUser } from "./helpers";

// Requires local S3 (pnpm media:start, then pnpm db:env) — the browser uploads straight to it.

function unique(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** A valid 16-bit stereo 44.1 kHz WAV: a quiet 440 Hz tone (or silence). */
function silentWav(seconds = 1, tone = false) {
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
  if (tone) {
    for (let i = 0; i < rate * seconds; i++) {
      const sample = Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000);
      buffer.writeInt16LE(sample, 44 + i * 4);
      buffer.writeInt16LE(sample, 46 + i * 4);
    }
  }
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
  await expect(page).toHaveURL(new RegExp(`/artysci/${slug}/wydawnictwa/szyb/edytuj$`));
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
    // The worker may already be on it (or done: 1 s is too short), so any honest state is fine —
    // but never "ready" before anything checked the file.
    await expect(track.getByRole("status")).toHaveText(
      /^(Przesłano Halda Master\.wav \(0,2 MB\) — czeka na sprawdzenie i przetworzenie\.|Sprawdzamy i przetwarzamy Halda Master\.wav…|Plik Halda Master\.wav został odrzucony\. .+)$/,
    );
    await expect(page.locator(".readiness__done", { hasText: "Pliki master" })).toHaveCount(0);

    // A replacement starts a new upload; the newest one is shown.
    await track.getByLabel("Prześlij nowy plik: Hałda").setInputFiles({
      name: "Halda v2.flac",
      mimeType: "audio/flac",
      buffer: silentWav(2),
    });
    await expect(track.getByRole("status")).toHaveText(/Halda v2\.flac/);
  });

  // Needs the audio worker (pnpm worker:start) polling the local queue.
  test("the worker checks the master; the team can listen to the processed versions", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await draftWithTrack(page);
    const track = page.locator(".track-item").first();
    await track.getByLabel("Wybierz plik master: Hałda").setInputFiles({
      name: "Halda.wav",
      mimeType: "audio/wav",
      buffer: silentWav(12, true),
    });
    await expect(track.getByRole("status")).toHaveText(/^Gotowe: Halda\.wav/, { timeout: 90_000 });
    await expect(track.getByText("WAV 16/44.1 · 0:12")).toBeVisible();
    await expect(
      track.getByText("Wersje do odtwarzania: Data Saver, High, Lossless."),
    ).toBeVisible();
    await expect(
      page.locator(".readiness__done", { hasText: "Pliki master wszystkich utworów — sprawdzone" }),
    ).toBeVisible();

    await track.getByRole("button", { name: "Odsłuchaj: Hałda" }).click();
    const player = page.getByRole("region", { name: "Odtwarzacz" });
    await expect(player.getByText("Hałda")).toBeVisible();
    await expect(player.getByRole("button", { name: "Pauza" })).toBeVisible();
    await expect(player.locator(".quality-chip")).toContainText("Lossless");
    await expect(player.locator(".player-bar__quality")).toHaveAttribute("title", /FLAC 16\/44\.1/);
  });

  test("a master that is too short is rejected with a reason in Polish", async ({ page }) => {
    test.setTimeout(150_000);
    await draftWithTrack(page);
    const track = page.locator(".track-item").first();
    await track.getByLabel("Wybierz plik master: Hałda").setInputFiles({
      name: "krotki.wav",
      mimeType: "audio/wav",
      buffer: silentWav(5, true),
    });
    await expect(track.getByRole("status")).toHaveText(
      "Plik krotki.wav został odrzucony. Utwór musi trwać od 10 sekund do 4 godzin.",
      { timeout: 90_000 },
    );
  });
});
