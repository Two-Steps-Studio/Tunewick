import { expect, type Page, test } from "@playwright/test";
import { createConfirmedUser, enableMfa, grantPremium, grantRole, solidPng } from "./helpers";

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
  const email = await createConfirmedUser(page, "publish-artist");
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

  await expect(page.getByLabel("Dodaj okładkę")).toBeEnabled();

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
  return { slug, email };
}

test.describe("review and publishing", () => {
  test.setTimeout(240_000);

  test("artist submits, moderator returns then approves, a listener plays it", async ({
    page,
    browser,
  }) => {
    const { slug, email } = await readyRelease(page);
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

    // Browse lists it with the reason it is there: the artist's first release.
    await listener.goto("/przegladaj");
    const card = listener.locator(".release-card", { hasText: `Familok ${slug}` });
    await expect(card.getByRole("link", { name: "Szychta" })).toBeVisible();
    await expect(card.getByText(/^Debiut · /)).toBeVisible();

    // A shared song: public page with the preview (no account), then into Discover with it first.
    await listener.goto(`/artysci/${slug}`);
    await listener.getByRole("link", { name: "Nocna zmiana" }).click();
    await expect(listener).toHaveURL(new RegExp(`/song/${slug}/nocna-zmiana-[a-z2-9]{10}$`));
    await expect(listener.getByRole("heading", { level: 1 })).toHaveText("Nocna zmiana");
    await expect(
      listener.getByRole("button", { name: "Odtwórz fragment: Nocna zmiana" }),
    ).toBeVisible();
    await listener.getByRole("link", { name: "Odkrywaj więcej na Tunewick" }).click();
    const first = listener.locator(".feed-card").first();
    await expect(first.getByRole("heading", { level: 2 })).toHaveText("Nocna zmiana");
    await expect(first.getByText("Ktoś Ci to udostępnił")).toBeVisible();

    // Search finds the newly published music — no Polish characters needed.
    await listener.goto(`/szukaj?q=${encodeURIComponent(`familok ${slug}`)}`);
    await expect(
      listener.getByRole("link", { name: `Familok ${slug}`, exact: true }),
    ).toBeVisible();
    await listener.getByRole("searchbox").fill("nocna zmiana");
    await listener.getByRole("button", { name: "Szukaj" }).click();
    await expect(listener).toHaveURL(/\/szukaj\?q=nocna\+zmiana$/);
    await listener.getByRole("button", { name: "Odtwórz: Nocna zmiana" }).first().click();
    await expect(bar.getByText("Nocna zmiana")).toBeVisible();

    // Premium (from the database, granted server-side) unlocks the lossless variant.
    await page.goto("/ustawienia");
    await expect(page.getByText(/^Free — /)).toBeVisible();
    grantPremium(email, 30);
    await page.reload();
    await expect(page.getByText(/^Premium do \d{1,2} \S+ \d{4}/)).toBeVisible();
    await expect(page.getByText("Przyznane przez zespół Tunewick: e2e")).toBeVisible();
    await page.goto(`/artysci/${slug}/wydawnictwa/szychta`);
    await page.getByRole("button", { name: "Odtwórz: Nocna zmiana" }).click();
    const artistBar = page.getByRole("region", { name: "Odtwarzacz" });
    await expect(artistBar.locator(".quality-chip")).toContainText("Lossless");
    expect(await page.content()).toContain("lossless.flac");

    // Library: like the track and the release, follow the artist; all of it is in the library.
    await expect(listener.getByRole("button", { name: /^Polub/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Polub: Nocna zmiana" }).click();
    await expect(
      page.getByRole("button", { name: "Usuń z polubionych: Nocna zmiana" }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Polub", exact: true }).click();
    await expect(page.getByRole("button", { name: "Polubione", exact: true })).toBeVisible();
    await page.goto(`/artysci/${slug}`);
    await expect(page.getByText("Nikt jeszcze nie obserwuje")).toBeVisible();
    await page.getByRole("button", { name: "Obserwuj", exact: true }).click();
    await expect(page.getByText("1 osoba obserwuje")).toBeVisible();
    await expect(page.getByRole("button", { name: "Obserwujesz" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.goto("/biblioteka");
    await expect(page.getByRole("heading", { name: "Polubione utwory (1)" })).toBeVisible();
    await expect(page.locator(".release-card", { hasText: "Szychta" })).toBeVisible();
    await expect(page.locator(".artist-card", { hasText: `Familok ${slug}` })).toBeVisible();
    await page.getByRole("button", { name: "Odtwórz polubione utwory" }).click();
    await expect(
      page.getByRole("region", { name: "Odtwarzacz" }).getByText("Nocna zmiana"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Usuń z polubionych: Nocna zmiana" }).click();
    await page.reload();
    await expect(page.getByRole("heading", { name: /^Polubione utwory/ })).toHaveCount(0);

    // Signed out, the library asks to sign in.
    await listener.goto("/biblioteka");
    await expect(listener.getByRole("link", { name: "Zaloguj się" }).last()).toBeVisible();

    // Playlists: create, add (twice — duplicates are allowed), reorder, remove, share, delete.
    await page.goto("/biblioteka");
    await page.getByLabel("Nowa playlista").fill("Na nocną zmianę");
    await page.getByRole("button", { name: "Utwórz" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Na nocną zmianę");
    const playlistUrl = page.url();
    await expect(page.getByText(/^Playlista jest pusta/)).toBeVisible();

    await page.goto(`/artysci/${slug}/wydawnictwa/szychta`);
    for (let i = 0; i < 2; i++) {
      await page.getByLabel("Dodaj do playlisty: Nocna zmiana").click();
      await page.getByRole("button", { name: "Dodaj", exact: true }).click();
      await expect(page.getByText("Dodano do: Na nocną zmianę")).toBeVisible();
      await page.reload();
    }

    await page.goto(playlistUrl);
    await expect(page.getByText("2 utwory")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Przesuń wyżej: Nocna zmiana (pozycja 1)" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Przesuń wyżej: Nocna zmiana (pozycja 2)" }).click();
    await page.getByRole("button", { name: "Usuń z playlisty: Nocna zmiana (pozycja 2)" }).click();
    await expect(page.getByText("1 utwór", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Odtwórz playlistę Na nocną zmianę" }).click();
    await expect(
      page.getByRole("region", { name: "Odtwarzacz" }).getByText("Nocna zmiana"),
    ).toBeVisible();

    // Listening history: a few seconds actually played are recorded when the page goes away.
    await expect(page.locator(".player-bar__time").first()).toHaveText(/^0:0[3-9]$/, {
      timeout: 20_000,
    });
    await page.goto("/biblioteka");
    const history = page.locator("section", {
      has: page.getByRole("heading", { name: "Ostatnio słuchane" }),
    });
    // The listen is sent while the page unloads, so it may land just after this page renders.
    await expect(async () => {
      await page.reload();
      await expect(history.getByRole("link", { name: "Nocna zmiana" })).toBeVisible({
        timeout: 1000,
      });
    }).toPass({ timeout: 15_000 });
    await expect(history.getByText(/· 1 raz$/)).toBeVisible();
    await history.getByRole("button", { name: "Wyczyść historię" }).click();
    await history.getByRole("button", { name: "Tak, wyczyść" }).click();
    await expect(page.getByRole("heading", { name: "Ostatnio słuchane" })).toHaveCount(0);
    await page.goto(playlistUrl);

    // Private by default: a listener with the link gets nothing; unlisted opens for them.
    expect((await listener.goto(playlistUrl))?.status()).toBe(404);
    await page.getByLabel("Kto ją widzi").selectOption("unlisted");
    await page.getByRole("button", { name: "Zapisz", exact: true }).click();
    await expect(page.getByText("Zapisano.")).toBeVisible();
    await listener.goto(playlistUrl);
    await expect(listener.getByRole("heading", { level: 1 })).toHaveText("Na nocną zmianę");
    await expect(listener.getByRole("button", { name: /^Usuń z playlisty/ })).toHaveCount(0);

    await page.getByRole("button", { name: "Usuń playlistę" }).click();
    await page.getByRole("button", { name: "Tak, usuń" }).click();
    await expect(page).toHaveURL(/\/biblioteka$/);
    expect((await listener.goto(playlistUrl))?.status()).toBe(404);

    await anonymous.close();
    await staffContext.close();
  });
});
