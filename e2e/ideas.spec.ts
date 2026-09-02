import { expect, test } from "@playwright/test";

const password = "e2e-password-123";

function emailFor(testName: string): string {
  return `${testName}-${crypto.randomUUID()}@example.test`;
}

test("shows the localized Ideas setup state in both directions", async ({ page }) => {
  await page.goto("/en/sign-up");
  await page.getByLabel("Name").fill("Ideas Creator");
  await page.getByLabel("Email address").fill(emailFor("ideas").toLowerCase());
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/en\/dashboard$/);

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
