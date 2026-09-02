import { expect, test, type Page } from "@playwright/test";

const password = "e2e-password-123";

function emailFor(testName: string): string {
  return `${testName}-${crypto.randomUUID()}@example.test`;
}

async function signUp(page: Page) {
  await page.goto("/en/sign-up");
  await page.getByLabel("Name").fill("Ideas Creator");
  await page.getByLabel("Email address").fill(emailFor("ideas").toLowerCase());
  await page.getByLabel("Password").fill(password);
  const signUpResponse = page.waitForResponse((response) =>
    response.url().includes("/api/auth/sign-up/email"),
  );
  await page.getByRole("button", { name: "Create account" }).click();
  const response = await signUpResponse;
  if (response.status() === 429) {
    // Better Auth limits sign-up to three requests per ten seconds per client IP.
    await page.waitForTimeout(10_000);
    const retryResponse = page.waitForResponse((retry) =>
      retry.url().includes("/api/auth/sign-up/email"),
    );
    await page.getByRole("button", { name: "Create account" }).click();
    await retryResponse;
  }
  await expect(page).toHaveURL(/\/en\/dashboard$/);
}

async function createReadyDna(
  page: Page,
  creatorDescription = "Public product education for founders.",
) {
  await page.goto("/en/content-dna");
  await page.getByLabel("Creator or brand description").fill(creatorDescription);
  await page
    .getByLabel("Target audience description")
    .fill("Independent founders building useful products.");
  await page.getByLabel("Primary topics, item 1").fill("Product strategy");
  await page.getByLabel("Tone traits, item 1").fill("Practical");
  await page.getByLabel("Content goals, item 1").fill("Help people make better decisions");
  await page.getByRole("combobox", { name: "Default content language" }).click();
  await page.getByRole("option", { name: "English" }).click();
  await page.getByRole("checkbox", { name: "English" }).check();
  await page.getByRole("button", { name: "Save Content DNA" }).click();
  await expect(page.getByText("AI-ready", { exact: true })).toBeVisible();
}

test("shows the localized Ideas setup state in both directions", async ({ page }) => {
  await signUp(page);
  await page.goto("/en/ideas");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { name: "Set up Content DNA first" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate 20 Ideas" })).toHaveCount(0);

  await page.getByRole("link", { name: "فارسی" }).click();
  await expect(page).toHaveURL(/\/fa\/ideas$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "fa");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "ابتدا DNA محتوا را بسازید" })).toBeVisible();
  await expect(page.getByRole("button", { name: "تولید ۲۰ ایده" })).toHaveCount(0);
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    await page.locator("body").evaluate((body) => body.clientWidth),
  );
});

test("keeps generation unavailable while Content DNA is incomplete", async ({ page }) => {
  await signUp(page);
  await page.goto("/en/content-dna");
  await page.getByLabel("Creator or brand description").fill("Synthetic incomplete DNA.");
  await page.getByRole("button", { name: "Save Content DNA" }).click();
  await page.goto("/en/ideas");

  await expect(page.getByRole("heading", { name: "Finish your Content DNA" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate 20 Ideas" })).toHaveCount(0);
});

test("shows the active generation state on desktop while the mocked provider is delayed", async ({
  page,
}) => {
  await signUp(page);
  await createReadyDna(page, "E2E provider delay");
  await page.goto("/en/ideas");

  const generateButton = page.getByRole("button", { name: "Generate 20 Ideas" });
  await generateButton.click();
  await expect(page.getByRole("status").filter({ hasText: "Generating ideas" })).toBeVisible();
  await expect(generateButton).toBeDisabled();
  await expect(page.getByRole("heading", { name: "20 ideas to work through" })).toBeVisible();
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    await page.locator("body").evaluate((body) => body.clientWidth),
  );
});

test("renders a safe failed batch and retries without exposing provider details", async ({
  page,
}) => {
  await signUp(page);
  await createReadyDna(page, "E2E provider failure");
  await page.goto("/en/ideas");

  await page.getByRole("button", { name: "Generate 20 Ideas" }).click();
  await expect(page.getByText(/The idea provider was unavailable\./)).toBeVisible();
  await expect(page.getByRole("heading", { name: "This generation did not finish" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry generation" })).toBeVisible();
  await expect(page.getByRole("link", { name: /DNA version 1/ })).toHaveCount(1);

  await page.getByRole("button", { name: "Retry generation" }).click();
  await expect(page.getByText(/The idea provider was unavailable\./)).toBeVisible();
  await expect(page.getByRole("link", { name: /DNA version 1/ })).toHaveCount(2);
});

test("shows workspace rate limiting without creating a fourth batch", async ({ page }) => {
  await signUp(page);
  await createReadyDna(page);
  await page.goto("/en/ideas");

  const generateButton = page.getByRole("button", { name: "Generate 20 Ideas" });
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await generateButton.click();
    await expect(page.getByRole("link", { name: /DNA version 1/ })).toHaveCount(attempt);
  }

  await generateButton.click();
  await expect(page.getByText("Generation is temporarily limited", { exact: true })).toBeVisible();
  await expect(page.getByText(/No new batch was created\./)).toBeVisible();
  await expect(page.getByRole("link", { name: /DNA version 1/ })).toHaveCount(3);
});

test("keeps a stale-DNA conflict visible without invoking the provider", async ({
  context,
  page,
}) => {
  await signUp(page);
  await createReadyDna(page);
  await page.goto("/en/ideas");

  const newerPage = await context.newPage();
  await newerPage.goto("/en/content-dna");
  await newerPage.getByLabel("Creator or brand description").fill("A newer synthetic DNA version.");
  await newerPage.getByRole("button", { name: "Save Content DNA" }).click();
  await expect(newerPage.getByText("Version 2", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Generate 20 Ideas" }).click();
  await expect(page.getByText("Content DNA changed", { exact: true })).toBeVisible();
  await newerPage.close();
});

test("does not enumerate another workspace's idea batch", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();

  try {
    await signUp(ownerPage);
    await createReadyDna(ownerPage);
    await ownerPage.goto("/en/ideas");
    await ownerPage.getByRole("button", { name: "Generate 20 Ideas" }).click();
    await expect(ownerPage.getByRole("list", { name: "Generated ideas" })).toBeVisible();

    const batchHref = await ownerPage
      .getByRole("link", { name: /DNA version 1/ })
      .first()
      .getAttribute("href");
    const batchId = batchHref
      ? new URL(batchHref, ownerPage.url()).searchParams.get("batchId")
      : null;
    expect(batchId).toMatch(/^[0-9a-f-]{36}$/);

    const foreignContext = await browser.newContext();
    const foreignPage = await foreignContext.newPage();

    try {
      await signUp(foreignPage);
      await createReadyDna(foreignPage);
      await foreignPage.goto(`/en/ideas?batchId=${encodeURIComponent(batchId ?? "")}`);

      await expect(foreignPage.getByText("No idea batches yet", { exact: true })).toBeVisible();
      await expect(foreignPage.getByText("E2E idea 1", { exact: true })).toHaveCount(0);
      await expect(foreignPage.getByRole("button", { name: "Retry generation" })).toHaveCount(0);
    } finally {
      await foreignContext.close();
    }
  } finally {
    await ownerContext.close();
  }
});

test("creator completes the mocked generation and decision workflow across responsive locales", async ({
  page,
}) => {
  await signUp(page);
  await createReadyDna(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/ideas");

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  const generateButton = page.getByRole("button", { name: "Generate 20 Ideas" });
  await expect(generateButton).toBeVisible();
  const generateButtonBox = await generateButton.boundingBox();
  expect(generateButtonBox?.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    await page.locator("body").evaluate((body) => body.clientWidth),
  );

  await generateButton.click();
  const ideasList = page.getByRole("list", { name: "Generated ideas" });
  await expect(ideasList.getByRole("listitem")).toHaveCount(20);
  await expect(page.getByRole("heading", { name: "20 ideas to work through" })).toBeVisible();
  await expect(page.getByText("E2E idea 1", { exact: true })).toBeVisible();

  const firstCard = page.getByText("E2E idea 1", { exact: true }).locator("..");
  await firstCard.getByRole("button", { name: "Accept" }).click();
  await expect(firstCard.getByText("Accepted", { exact: true })).toBeVisible();

  const secondCard = page.getByText("E2E idea 2", { exact: true }).locator("..");
  await secondCard.getByRole("button", { name: "Save for later" }).click();
  await expect(secondCard.getByText("Saved for later", { exact: true })).toBeVisible();

  const thirdCard = page.getByText("E2E idea 3", { exact: true }).locator("..");
  const rejectButton = thirdCard.getByRole("button", { name: "Reject" });
  await rejectButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Reject this idea" })).toBeVisible();
  await expect(page.getByLabel("Reason (optional)")).toBeFocused();
  await page.getByLabel("Reason (optional)").fill("Not a fit for this batch.");
  await page.getByRole("button", { name: "Reject idea" }).click();
  await expect(thirdCard.getByText("Rejected", { exact: true })).toBeVisible();
  await expect(rejectButton).toBeFocused();

  await page.getByRole("link", { name: "فارسی" }).click();
  await expect(page).toHaveURL(/\/fa\/ideas$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "fa");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("heading", { name: "برای محتوای بعدی‌تان شروعی قوی‌تر بسازید." }),
  ).toBeVisible();
  await expect(page.locator("div[dir=rtl]").first()).toHaveCSS("direction", "rtl");
  await expect(page.getByText("E2E idea 1", { exact: true })).toBeVisible();
  const persianIdeasList = page.getByRole("list", { name: "ایده‌های تولیدشده" });
  await expect(persianIdeasList.getByText("ذخیره برای بعد", { exact: true }).first()).toBeVisible();
  await expect(persianIdeasList.getByText("ردشده", { exact: true }).first()).toBeVisible();
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    await page.locator("body").evaluate((body) => body.clientWidth),
  );
});
