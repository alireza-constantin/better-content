import { expect, test, type Page } from "@playwright/test";

function emailFor(testName: string): string {
  return `${testName}-${crypto.randomUUID()}@example.test`;
}

async function signUp(page: Page, email: string) {
  await page.goto("/en/sign-up");
  await page.getByLabel("Name").fill("E2E Creator");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/en\/dashboard$/);

  const sessionCookie = (await page.context().cookies()).find((cookie) => cookie.name === "better-auth.session_token");

  expect(sessionCookie).toMatchObject({
    httpOnly: true,
    sameSite: "Lax",
    secure: false,
  });
}

test("sign-up provisions a workspace, persists the session, switches locale, and signs out", async ({ page }) => {
  await signUp(page, emailFor("sign-up"));

  await expect(page.getByText("Workspace:")).toBeVisible();
  await expect(page.getByText("Workspace: Personal workspace", { exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

  await page.reload();
  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Your foundation is ready." })).toBeVisible();

  await page.getByRole("link", { name: "فارسی" }).click();
  await expect(page).toHaveURL(/\/fa\/dashboard$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "fa");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "پایهٔ کار شما آماده است." })).toBeVisible();

  await page.getByRole("button", { name: "خروج" }).click();
  await expect(page).toHaveURL(/\/fa\/sign-in$/);

  await page.goto("/fa/dashboard");
  await expect(page).toHaveURL(/\/fa\/sign-in$/);
});

test("protected routes redirect in English and Persian without a redirect loop", async ({ page }) => {
  const protectedRouteResponse = await page.goto("/en/dashboard");
  await expect(page).toHaveURL(/\/en\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  expect(protectedRouteResponse?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(protectedRouteResponse?.headers()["x-frame-options"]).toBe("DENY");

  await page.goto("/fa/dashboard");
  await expect(page).toHaveURL(/\/fa\/sign-in$/);
  await expect(page.getByRole("heading", { name: "خوش برگشتید." })).toBeVisible();
});

test("an existing user can sign in and invalid credentials show a safe localized error", async ({ page }) => {
  const email = emailFor("sign-in");

  await signUp(page, email);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/en\/sign-in$/);

  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/dashboard$/);

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill("not-the-right-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("The email address or password is incorrect.", { exact: true })).toBeVisible();
});
