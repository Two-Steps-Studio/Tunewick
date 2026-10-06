import { expect, test } from "@playwright/test";
import { createConfirmedUser } from "./helpers";

test.describe("rights declaration", () => {
  test.setTimeout(90_000);

  test("declare rights with validation, keep input on errors, show summary and readiness", async ({
    page,
  }) => {
    await createConfirmedUser(page, "rights");
    const slug = `prawa-${Date.now().toString(36)}`;
    await page.goto("/artysci/nowy");
    await page.getByLabel("Nazwa artysty").fill("Projekt Prawa");
    await page.getByLabel("Adres profilu").fill(slug);
    await page.getByRole("button", { name: "Załóż profil" }).click();
    await page.getByRole("link", { name: "Nowe wydawnictwo" }).click();
    await page.getByLabel("Tytuł").fill("Singiel z prawami");
    await page.getByRole("button", { name: "Utwórz szkic" }).click();
    await page.waitForURL(/wydawnictwa/);

    const readiness = page.locator(".readiness");
    await expect(readiness.locator(".readiness__todo")).toHaveCount(4);
    await expect(
      page.getByText("Treść oświadczenia i warunków dla artystów jest wersją roboczą"),
    ).toBeVisible();

    const rights = page.locator("form", {
      has: page.getByRole("button", { name: "Złóż oświadczenie" }),
    });
    await rights.getByRole("button", { name: "Złóż oświadczenie" }).click();
    await expect(
      page.getByText("Tunewick przyjmuje tylko nagrania, do których masz prawa."),
    ).toBeVisible();
    await expect(
      page.getByText("Zaznacz odpowiedź (również „Nie” albo „Nie wiem”)."),
    ).toBeVisible();
    await expect(page.getByText("Aby złożyć oświadczenie, zaakceptuj warunki.")).toBeVisible();

    await rights.getByLabel("Mam (lub mamy) prawa do nagrań").check();
    await rights.getByRole("checkbox", { name: "ZAiKS" }).check();
    await rights.getByRole("checkbox", { name: "Nie, nikt nie należy" }).check();
    await rights.getByRole("radio", { name: "Są sample — mam zgodę na ich użycie" }).check();
    await rights.getByLabel("Udział sztucznej inteligencji").selectOption("ai_assisted");
    await rights.getByLabel(/Akceptuję warunki dla artystów/).check();
    await rights.getByRole("button", { name: "Złóż oświadczenie" }).click();

    await expect(
      page.getByText("„Nie, nikt nie należy” nie może być zaznaczone razem z organizacją."),
    ).toBeVisible();
    await expect(page.getByText("Opisz sample i zgody.")).toBeVisible();
    // Everything typed so far survives the error.
    await expect(rights.getByLabel("Mam (lub mamy) prawa do nagrań")).toBeChecked();
    await expect(rights.getByRole("checkbox", { name: "ZAiKS" })).toBeChecked();
    await expect(rights.getByLabel("Udział sztucznej inteligencji")).toHaveValue("ai_assisted");
    await expect(rights.getByLabel(/Akceptuję warunki dla artystów/)).toBeChecked();

    await rights.getByRole("checkbox", { name: "Nie, nikt nie należy" }).uncheck();
    await rights.getByRole("checkbox", { name: "STOART" }).check();
    await rights
      .getByLabel("Opisz sample i zgody (autor, źródło, rodzaj zgody)")
      .fill("Nagranie terenowe z Nikiszowca, zgoda autora z 2026-09-01");
    await rights.getByRole("button", { name: "Złóż oświadczenie" }).click();

    const summary = page.locator(".declaration");
    await expect(summary).toContainText("Złożone oświadczenie");
    await expect(summary).toContainText("ZAiKS, STOART");
    await expect(summary).toContainText("Z pomocą AI");
    await expect(summary).toContainText("draft-2026-10");
    await expect(page.getByText("Złóż nowe oświadczenie")).toBeVisible();

    // Readiness: rights done; no tracks yet; audio honestly not available.
    // The declaration also sets the release's AI value (one source of truth).
    await expect(readiness.locator(".readiness__done")).toHaveText([
      /Określony udział AI/,
      /Złożone oświadczenie o prawach/,
    ]);
    await expect(readiness).toContainText("przesyłanie plików pojawi się w kolejnym etapie");
  });
});
