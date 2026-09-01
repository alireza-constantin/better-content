import { expect, test, type Page } from "@playwright/test";

const password = "e2e-password-123";

function emailFor(testName: string): string {
  return `${testName}-${crypto.randomUUID()}@example.test`;
}

async function signUp(page: Page, locale: "en" | "fa" = "en") {
  const english = locale === "en";

  await page.goto(`/${locale}/sign-up`);
  await page.getByLabel(english ? "Name" : "نام").fill("E2E Creator");
  await page.getByLabel(english ? "Email address" : "نشانی ایمیل").fill(emailFor("content-dna"));
  await page.getByLabel(english ? "Password" : "رمز عبور").fill(password);
  await page.getByRole("button", { name: english ? "Create account" : "ایجاد حساب" }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/dashboard$`));
}

async function save(page: Page, locale: "en" | "fa") {
  await page
    .getByRole("button", { name: locale === "en" ? "Save Content DNA" : "ذخیرهٔ DNA محتوا" })
    .click();
}

async function fillIdentity(page: Page, locale: "en" | "fa", value: string) {
  await page
    .getByLabel(locale === "en" ? "Creator or brand description" : "توضیح سازنده یا برند")
    .fill(value);
}

async function fillReadyFields(page: Page) {
  await page
    .getByLabel("Target audience description")
    .fill("Independent founders building useful products.");
  await page.getByLabel("Primary topics, item 1").fill("Product strategy");
  await page.getByRole("button", { name: "Add to Primary topics" }).click();
  await page.getByLabel("Primary topics, item 2").fill("Audience research");
  const movePrimaryTopicUp = page.getByRole("button", { name: "Move Audience research up" });
  await movePrimaryTopicUp.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Primary topics, item 1")).toHaveValue("Audience research");
  await page.getByLabel("Tone traits, item 1").fill("Practical");
  await page.getByLabel("Content goals, item 1").fill("Help people make better decisions");

  await page.getByRole("combobox", { name: "Default content language" }).click();
  await page.getByRole("option", { name: "English" }).click();
  await page.getByRole("checkbox", { name: "English" }).check();
}

test("creator can create, edit, inspect history, and recover from a stale save", async ({
  context,
  page,
}) => {
  await signUp(page);
  await page.goto("/en/content-dna");

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.locator("body")).toHaveCSS("font-family", /Roboto/);
  await expect(page.getByRole("heading", { name: "Start your Content DNA" })).toBeVisible();
  await expect(page.getByText("Keep private information out", { exact: true })).toBeVisible();

  await fillIdentity(page, "en", "Creator v1: practical product education.");
  await save(page, "en");

  await expect(page.getByText("Version 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Incomplete", { exact: true })).toBeVisible();
  await expect(page.getByText("You have unsaved changes.", { exact: true })).toHaveCount(0);

  const stalePage = await context.newPage();
  await stalePage.setViewportSize({ width: 390, height: 844 });
  await stalePage.goto("/en/content-dna");
  await stalePage.getByRole("link", { name: "فارسی" }).click();
  await expect(stalePage).toHaveURL(/\/fa\/content-dna$/);
  await expect(stalePage.locator("html")).toHaveAttribute("lang", "fa");
  await expect(stalePage.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(stalePage.locator("body")).toHaveCSS("font-family", /Vazirmatn/);
  await expect(stalePage.getByText("اطلاعات خصوصی را وارد نکنید", { exact: true })).toBeVisible();
  await expect(stalePage.getByLabel("توضیح سازنده یا برند")).toHaveValue(
    "Creator v1: practical product education.",
  );

  const saveButton = stalePage.getByRole("button", { name: "ذخیرهٔ DNA محتوا" });
  const saveButtonBox = await saveButton.boundingBox();
  expect(saveButtonBox?.width).toBeGreaterThanOrEqual(44);
  expect(saveButtonBox?.height).toBeGreaterThanOrEqual(44);

  await fillIdentity(page, "en", "Creator v2: practical product education for founders.");
  await fillReadyFields(page);
  await save(page, "en");

  await expect(page.getByText("Version 2", { exact: true })).toBeVisible();
  await expect(page.getByText("AI-ready", { exact: true })).toBeVisible();

  await fillIdentity(stalePage, "fa", "Local browser edit");
  await save(stalePage, "fa");

  await expect(stalePage.getByText("نسخهٔ جدیدتری در دسترس است", { exact: true })).toBeVisible();
  await expect(stalePage.getByLabel("توضیح سازنده یا برند")).toHaveValue("Local browser edit");
  await expect(stalePage.getByText("تغییرات ذخیره‌نشده دارید.", { exact: true })).toBeVisible();
  await expect(stalePage.getByRole("button", { name: "بارگذاری آخرین نسخه" })).toBeVisible();
  await expect(stalePage.locator("body")).toHaveJSProperty(
    "scrollWidth",
    await stalePage.locator("body").evaluate((body) => body.clientWidth),
  );

  await stalePage.getByRole("button", { name: "بارگذاری آخرین نسخه" }).click();
  await expect(stalePage.getByLabel("توضیح سازنده یا برند")).toHaveValue(
    "Creator v2: practical product education for founders.",
  );
  await expect(stalePage.getByRole("combobox", { name: "زبان پیش‌فرض محتوا" })).toContainText(
    "انگلیسی",
  );
  await expect(stalePage.getByRole("checkbox", { name: "انگلیسی" })).toHaveAttribute(
    "data-state",
    "checked",
  );
  await expect(stalePage.getByText("تغییرات ذخیره‌نشده دارید.", { exact: true })).toHaveCount(0);

  await stalePage.getByRole("link", { name: "مشاهدهٔ تاریخچهٔ نسخه‌ها" }).click();
  await expect(stalePage).toHaveURL(/\/fa\/content-dna\/history$/);
  const staleHistoryItems = stalePage.locator("ol > li");
  await expect(staleHistoryItems).toHaveCount(2);
  await expect(staleHistoryItems.nth(0)).toContainText("نسخهٔ 2");
  await expect(staleHistoryItems.nth(0)).toContainText("فعلی");
  await expect(staleHistoryItems.nth(1)).toContainText("نسخهٔ 1");
  await expect(staleHistoryItems.nth(1)).toContainText("ناقص");
  await stalePage.close();

  await page.getByRole("link", { name: "View version history" }).click();
  await expect(page).toHaveURL(/\/en\/content-dna\/history$/);

  const historyItems = page.locator("ol > li");
  await expect(historyItems).toHaveCount(2);
  await expect(historyItems.nth(0)).toContainText("Version 2");
  await expect(historyItems.nth(0)).toContainText("Current");
  await expect(historyItems.nth(0)).toContainText("AI-ready");
  await expect(historyItems.nth(1)).toContainText("Version 1");
  await expect(historyItems.nth(1)).toContainText("Incomplete");
  await expect(historyItems.nth(1).getByText("Current", { exact: true })).toHaveCount(0);

  await historyItems.nth(1).getByRole("link").click();
  await expect(page).toHaveURL(/\/en\/content-dna\/history\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Version 1" })).toBeVisible();
  await expect(
    page.getByText("Creator v1: practical product education.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("AI-ready", { exact: true })).toHaveCount(0);

  await page.getByRole("link", { name: "Back to version history" }).click();
  await historyItems.nth(0).getByRole("link").click();
  await expect(page.getByRole("heading", { name: "Version 2" })).toBeVisible();
  await expect(
    page.getByText("Creator v2: practical product education for founders.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Product strategy", { exact: true })).toBeVisible();
});
