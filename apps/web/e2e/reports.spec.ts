import { expect, test } from "@playwright/test";
import { createConfirmedUser, enableMfa, grantRole } from "./helpers";

// Notice-and-action (DSA): report → decision with a statement of reasons → appeal → a different
// moderator decides. Uses an artist profile (public without publishing music).

test("a report leads to a reasoned decision, an appeal and a reversal by another moderator", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const slug = `zgl-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  await createConfirmedUser(page, "report-artist");
  await page.goto("/artysci/nowy");
  await page.getByLabel("Nazwa artysty").fill(`Podróbka ${slug}`);
  await page.getByLabel("Adres profilu").fill(slug);
  await page.getByRole("button", { name: "Załóż profil" }).click();
  await expect(page).toHaveURL(new RegExp(`/artysci/${slug}/zarzadzaj$`));

  // A listener reports the profile as a copyright problem.
  const reporterContext = await browser.newContext({ locale: "pl-PL" });
  const reporter = await reporterContext.newPage();
  await createConfirmedUser(reporter, "reporter");
  await reporter.goto(`/artysci/${slug}`);
  await reporter.getByRole("link", { name: "Zgłoś naruszenie" }).click();
  await expect(reporter.getByText(`Zgłaszasz: profil artysty „Podróbka ${slug}”`)).toBeVisible();
  await reporter.getByLabel("Powód").selectOption("copyright");
  await reporter.getByLabel("Opis").fill("Ten profil publikuje nagrania naszego zespołu.");
  await reporter.getByRole("button", { name: "Wyślij zgłoszenie" }).click();
  await expect(reporter.getByRole("main").getByRole("alert")).toHaveText(
    "Przy naruszeniu praw autorskich podaj imię i nazwisko, poprawny e-mail i zaznacz oświadczenie.",
  );
  await reporter.getByLabel("Imię i nazwisko lub nazwa podmiotu uprawnionego").fill("Jan Kowalski");
  await reporter.getByLabel("E-mail do kontaktu").fill("jan@example.com");
  await reporter.getByLabel(/^Oświadczam w dobrej wierze/).check();
  await reporter.getByRole("button", { name: "Wyślij zgłoszenie" }).click();
  await expect(reporter.getByRole("main").getByRole("status")).toHaveText(
    "Dziękujemy. Zgłoszenie trafiło do moderatorów.",
  );

  // Moderator 1 suspends the profile with a statement of reasons.
  const mod1Context = await browser.newContext({ locale: "pl-PL" });
  const mod1 = await mod1Context.newPage();
  grantRole(await createConfirmedUser(mod1, "report-mod1"), "moderator");
  await mod1.goto("/moderacja");
  await enableMfa(mod1);
  await mod1.goto("/moderacja");
  const item = mod1.locator(".report-item", { has: mod1.locator(`a[href="/artysci/${slug}"]`) });
  await expect(item.getByText(/wnioskodawca: Jan Kowalski <jan@example.com>/)).toBeVisible();
  await item.getByLabel("Uzasadnienie (zobaczy je właściciel treści)").fill("Za krótko");
  await item.getByRole("button", { name: "Zapisz decyzję" }).click();
  await expect(item.getByRole("alert")).toHaveText("Uzasadnienie musi mieć co najmniej 20 znaków.");
  const statement =
    "Wnioskodawca wskazał, że profil podszywa się pod jego zespół i publikuje jego nagrania.";
  await item.getByLabel("Uzasadnienie (zobaczy je właściciel treści)").fill(statement);
  await item.getByRole("button", { name: "Zapisz decyzję" }).click();
  await expect(item).toHaveCount(0);
  expect((await reporter.goto(`/artysci/${slug}`))?.status()).toBe(404);

  // The artist reads the reasons and appeals.
  await page.reload();
  const decisions = page.locator("section", {
    has: page.getByRole("heading", { name: "Decyzje moderacji" }),
  });
  await expect(decisions.getByText(statement)).toBeVisible();
  await decisions.getByLabel("Odwołanie").fill("To nasz zespół — mamy umowę i nagrania z sesji.");
  await decisions.getByRole("button", { name: "Wyślij odwołanie" }).click();
  await expect(decisions.getByText(/odwołanie w toku/)).toBeVisible();

  // The same moderator cannot decide the appeal; another one grants it.
  await mod1.reload();
  const appeal = mod1.locator(".promo-codes__item", {
    has: mod1.locator(`a[href="/artysci/${slug}"]`),
  });
  await appeal
    .getByLabel("Uzasadnienie decyzji w sprawie odwołania")
    .fill("Odwołanie zasadne, umowa potwierdzona przez wnioskodawcę.");
  await appeal.getByRole("button", { name: "Uwzględnij odwołanie (przywróć)" }).click();
  await expect(appeal.getByRole("alert")).toHaveText(
    /odwołanie od własnej decyzji rozpatruje inny moderator/,
  );

  const mod2Context = await browser.newContext({ locale: "pl-PL" });
  const mod2 = await mod2Context.newPage();
  grantRole(await createConfirmedUser(mod2, "report-mod2"), "moderator");
  await mod2.goto("/moderacja");
  await enableMfa(mod2);
  await mod2.goto("/moderacja");
  const appeal2 = mod2.locator(".promo-codes__item", {
    has: mod2.locator(`a[href="/artysci/${slug}"]`),
  });
  await appeal2
    .getByLabel("Uzasadnienie decyzji w sprawie odwołania")
    .fill("Odwołanie zasadne, umowa potwierdzona przez wnioskodawcę.");
  await appeal2.getByRole("button", { name: "Uwzględnij odwołanie (przywróć)" }).click();
  await expect(appeal2).toHaveCount(0);

  expect((await reporter.goto(`/artysci/${slug}`))?.status()).toBe(200);
  await page.reload();
  await expect(decisions.getByText(/odwołanie uwzględnione — przywrócono/)).toBeVisible();

  await reporterContext.close();
  await mod1Context.close();
  await mod2Context.close();
});

test("an impersonating profile is reported, reset, and its owner can appeal from Settings", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const handle = `podszywka-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  await createConfirmedUser(page, "report-profile");
  await page.goto("/ustawienia");
  await page.getByLabel("Nazwa profilu (adres)").fill(handle);
  await page.getByLabel("Nazwa wyświetlana").fill("Oficjalny Zespół");
  await page.getByRole("button", { name: "Zapisz zmiany" }).click();
  await expect(page.getByRole("status")).toHaveText("Zapisano.");

  const reporterContext = await browser.newContext({ locale: "pl-PL" });
  const reporter = await reporterContext.newPage();
  await createConfirmedUser(reporter, "reporter-profile");
  await reporter.goto(`/profil/${handle}`);
  await reporter.getByRole("link", { name: "Zgłoś naruszenie" }).click();
  await expect(reporter.getByText("Zgłaszasz: profil „Oficjalny Zespół”")).toBeVisible();
  await reporter.getByLabel("Powód").selectOption("impersonation");
  await reporter.getByLabel("Opis").fill("Ta osoba podaje się za nasz zespół.");
  await reporter.getByRole("button", { name: "Wyślij zgłoszenie" }).click();
  await expect(reporter.getByRole("main").getByRole("status")).toHaveText(
    "Dziękujemy. Zgłoszenie trafiło do moderatorów.",
  );

  const modContext = await browser.newContext({ locale: "pl-PL" });
  const mod = await modContext.newPage();
  grantRole(await createConfirmedUser(mod, "report-profile-mod"), "moderator");
  await mod.goto("/moderacja");
  await enableMfa(mod);
  await mod.goto("/moderacja");
  const item = mod.locator(".report-item", { has: mod.locator(`a[href="/profil/${handle}"]`) });
  await expect(item.getByLabel("Decyzja")).toHaveValue("reset_profile");
  const statement = "Profil podawał się za zespół, którego nie reprezentuje — nazwa wyczyszczona.";
  await item.getByLabel("Uzasadnienie (zobaczy je właściciel treści)").fill(statement);
  await item.getByRole("button", { name: "Zapisz decyzję" }).click();
  await expect(item).toHaveCount(0);
  expect((await reporter.goto(`/profil/${handle}`))?.status()).toBe(404);

  await page.goto("/ustawienia");
  await expect(page.getByLabel("Nazwa profilu (adres)")).toHaveValue("");
  const decisions = page.locator("section", {
    has: page.getByRole("heading", { name: "Decyzje moderacji" }),
  });
  await expect(decisions.getByText("Wyczyszczenie nazwy i opisu profilu")).toBeVisible();
  await expect(decisions.getByText(statement)).toBeVisible();
  await decisions.getByLabel("Odwołanie").fill("To mój zespół, mogę to potwierdzić.");
  await decisions.getByRole("button", { name: "Wyślij odwołanie" }).click();
  await expect(decisions.getByText(/odwołanie w toku/)).toBeVisible();

  await reporterContext.close();
  await modContext.close();
});
