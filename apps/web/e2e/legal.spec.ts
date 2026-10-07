import { expect, test } from "@playwright/test";

test("the legal documents are linked from every page and say they are drafts", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("navigation", { name: "Dokumenty" });
  await footer.getByRole("link", { name: "Polityka prywatności" }).click();
  await expect(page).toHaveURL(/\/prywatnosc$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Polityka prywatności");
  await expect(page.getByRole("note")).toContainText(
    "nie został jeszcze sprawdzony przez prawnika",
  );
  // Retention promised here is enforced by the daily job (supabase retention test).
  await expect(page.getByText(/Historia słuchania — 25 miesięcy/)).toBeVisible();

  for (const [name, path, heading] of [
    ["Regulamin", /\/regulamin$/, "Regulamin"],
    ["Regulamin dla artystów", /\/regulamin-dla-artystow$/, "Regulamin dla artystów"],
    ["Zasady treści i zgłoszeń", /\/zasady-tresci$/, "Zasady treści i zgłoszeń"],
  ] as const) {
    await footer.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
  }

  // Contents links jump to sections.
  await page
    .getByRole("navigation", { name: "Spis treści" })
    .getByRole("link", { name: "4. Odwołania" })
    .click();
  await expect(page).toHaveURL(/#odwolania$/);

  await page.goto("/en/privacy");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy Policy");
});

test("sign-up names the terms and the privacy policy", async ({ page }) => {
  await page.goto("/rejestracja");
  await expect(page.getByText(/Zakładając konto, akceptujesz Regulamin/)).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Polityka prywatności" }).first().click();
  await expect(page).toHaveURL(/\/prywatnosc$/);
});
