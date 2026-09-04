import { Client } from "pg";
import { expect, test, type Locator, type Page } from "@playwright/test";

const password = "e2e-password-123";
const contentProviderScenarioCookie = "better-content-e2e-content-script-scenario";
let nextE2eClientIp = 0;

function emailFor(testName: string): string {
  return `${testName}-${crypto.randomUUID()}@example.test`;
}

async function signUp(page: Page, email: string): Promise<void> {
  nextE2eClientIp = (nextE2eClientIp % 254) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `192.0.2.${nextE2eClientIp}` });
  await page.goto("/en/sign-up");
  await page.getByLabel("Name").fill("Script Creator");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/en\/dashboard$/);
}

async function createReadyContentDna(
  page: Page,
  defaultLanguage: "English" | "Persian" = "English",
): Promise<void> {
  await page.goto("/en/content-dna");
  await page.getByLabel("Creator or brand description").fill("A practical education creator.");
  await page.getByLabel("Target audience description").fill("Independent creators.");
  await page.getByLabel("Primary topics, item 1").fill("Content strategy");
  await page.getByLabel("Tone traits, item 1").fill("Practical");
  await page.getByLabel("Content goals, item 1").fill("Help creators make better decisions");
  await page.getByRole("combobox", { name: "Default content language" }).click();
  await page.getByRole("option", { name: defaultLanguage }).click();
  await page.getByRole("checkbox", { name: "English" }).check();
  await page.getByRole("checkbox", { name: "Persian" }).check();
  await page.getByRole("button", { name: "Save Content DNA" }).click();
  await expect(page.getByText("AI-ready", { exact: true })).toBeVisible();
}

async function generateAndAcceptFirstIdea(page: Page): Promise<void> {
  await page.goto("/en/ideas");
  await page.getByRole("button", { name: "Generate 20 Ideas" }).click();
  await expect(page.getByRole("heading", { name: "Ideas", exact: true })).toBeVisible();
  await page.locator("article").first().getByRole("button", { name: "Accept" }).click();
  await page.goto("/en/content");
  await expect(page.getByRole("heading", { name: "Production Queue" })).toBeVisible();
}

async function generateAndAcceptIdeas(page: Page, count: number): Promise<void> {
  await page.goto("/en/ideas");
  await page.getByRole("button", { name: "Generate 20 Ideas" }).click();
  await expect(page.getByRole("list", { name: "Generated ideas" })).toBeVisible();
  for (let index = 0; index < count; index += 1) {
    await page.getByRole("button", { name: "Accept" }).first().click();
  }
  await page.goto("/en/content");
  await expect(page.getByRole("heading", { name: "Production Queue" })).toBeVisible();
}

async function openScriptDialog(page: Page): Promise<Locator> {
  const queueItem = page
    .getByRole("list", { name: "Ideas in the Production Queue" })
    .locator(":scope > li")
    .first();
  await queueItem.getByRole("button", { name: "Generate" }).click();
  const dialog = page.getByRole("dialog", { name: "Generate a Script" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function submitScript(
  page: Page,
  options: Readonly<{ format?: "Short video" | "Long video"; instructions?: string }> = {},
): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "Generate a Script" });
  if (options.format) {
    await dialog.getByRole("combobox", { name: "Format" }).click();
    await page.getByRole("option", { name: options.format }).click();
  }
  if (options.instructions !== undefined) {
    await dialog.getByLabel("Instructions (optional)").fill(options.instructions);
  }
  await dialog.getByRole("button", { name: "Generate Script" }).click();
}

async function setContentProviderScenario(
  page: Page,
  scenario: "rate-limited" | "provider-unavailable" | "success",
): Promise<void> {
  await page.context().addCookies([
    {
      name: contentProviderScenarioCookie,
      value: scenario,
      url: "http://127.0.0.1:3100",
    },
  ]);
}

type ContentProviderTelemetry = Readonly<{
  invocationCount: number;
  lastRequestedLanguage: "en" | "fa" | null;
  lastRequestedFormat: "SHORT_VIDEO" | "LONG_VIDEO" | null;
}>;

async function readContentProviderTelemetry(page: Page): Promise<ContentProviderTelemetry> {
  const response = await page.request.get("/api/e2e/content-provider-telemetry");
  expect(response.ok()).toBe(true);
  return (await response.json()) as ContentProviderTelemetry;
}

async function findOwnerContentData(email: string): Promise<{
  workspaceId: string;
  versionId: string;
  ideaId: string;
}> {
  const databaseUrl = process.env.E2E_DATABASE_URL;
  if (!databaseUrl) throw new Error("E2E_DATABASE_URL is required for Content browser fixtures.");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{
      workspace_id: string;
      version_id: string;
      idea_id: string;
    }>(
      `SELECT wm.workspace_id, cdv.id AS version_id, i.id AS idea_id
       FROM "user" u
       INNER JOIN workspace_members wm ON wm.user_id = u.id
       INNER JOIN content_dna cd ON cd.workspace_id = wm.workspace_id
       INNER JOIN content_dna_versions cdv ON cdv.id = cd.current_version_id
       INNER JOIN ideas i ON i.status = 'ACCEPTED'
       INNER JOIN idea_generation_batches igb ON igb.id = i.batch_id
         AND igb.workspace_id = wm.workspace_id
       WHERE u.email = $1
       ORDER BY i.updated_at DESC
       LIMIT 1`,
      [email],
    );
    const owner = result.rows[0];
    if (!owner) throw new Error("The accepted Idea browser fixture was not found.");
    return {
      workspaceId: owner.workspace_id,
      versionId: owner.version_id,
      ideaId: owner.idea_id,
    };
  } finally {
    await client.end();
  }
}

async function readContentCount(email: string): Promise<number> {
  const databaseUrl = process.env.E2E_DATABASE_URL;
  if (!databaseUrl) throw new Error("E2E_DATABASE_URL is required to inspect Content fixtures.");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM contents c
       INNER JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
       INNER JOIN "user" u ON u.id = wm.user_id
       WHERE u.email = $1`,
      [email],
    );
    return Number(result.rows[0]?.count ?? 0);
  } finally {
    await client.end();
  }
}

async function seedActiveAttempts(email: string): Promise<void> {
  const databaseUrl = process.env.E2E_DATABASE_URL;
  if (!databaseUrl) throw new Error("E2E_DATABASE_URL is required to seed Content fixtures.");
  const owner = await findOwnerContentData(email);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const settings = {
      structuredOutput: { schemaName: "content_script_v1", schemaVersion: 1 },
      reasoningEffort: "medium",
      maxOutputTokens: 16_000,
      timeoutSeconds: 90,
      retryPolicy: { maxRetries: 0 },
      serviceTier: "default",
    };
    for (const status of ["PENDING", "RUNNING"] as const) {
      const runId = crypto.randomUUID();
      const attemptId = crypto.randomUUID();
      const idempotencyKey = crypto.randomUUID();
      const createdAt = new Date();
      const startedAt = status === "RUNNING" ? new Date(createdAt.getTime() + 1) : null;
      await client.query(
        `INSERT INTO ai_runs
          (id, workspace_id, kind, provider, model, prompt_version, generation_settings,
           status, created_at, started_at)
         VALUES ($1, $2, 'CONTENT_SCRIPT_GENERATION', 'avalai', 'gpt-5.6-luna',
           'content-script-generation/v1', $3::jsonb, $4, $5::timestamptz,
           $6::timestamptz)`,
        [runId, owner.workspaceId, JSON.stringify(settings), status, createdAt, startedAt],
      );
      await client.query(
        `INSERT INTO content_generation_attempts
          (id, workspace_id, source_idea_id, content_dna_version_id, requested_language,
           format, instructions, idempotency_key, request_fingerprint, ai_run_id, status,
           created_at, started_at)
         VALUES ($1, $2, $3, $4, 'en', 'SHORT_VIDEO', $5, $6, $7, $8, $9, $10::timestamptz,
           $11::timestamptz)`,
        [
          attemptId,
          owner.workspaceId,
          owner.ideaId,
          owner.versionId,
          status === "PENDING" ? "Persisted pending instructions" : null,
          idempotencyKey,
          "b".repeat(64),
          runId,
          status,
          createdAt,
          startedAt,
        ],
      );
      await client.query(
        `INSERT INTO workspace_content_generation_quota_reservations
          (workspace_id, attempt_id, reserved_at, invoked_at)
         VALUES ($1, $2, NOW(), CASE WHEN $3 = 'RUNNING' THEN NOW() ELSE NULL END)`,
        [owner.workspaceId, attemptId, status],
      );
    }
  } finally {
    await client.end();
  }
}

test("queued Idea synchronously generates Content and lands in the real localized editor", async ({
  page,
}) => {
  const email = emailFor("content-success").toLowerCase();
  await signUp(page, email);
  await createReadyContentDna(page);
  await generateAndAcceptFirstIdea(page);
  await setContentProviderScenario(page, "success");

  const before = await readContentProviderTelemetry(page);
  await openScriptDialog(page);
  await submitScript(page, {
    format: "Long video",
    instructions: "Open directly with the practical takeaway. مرحباً",
  });

  await expect(page).toHaveURL(/\/en\/content\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Script editor" })).toBeVisible();
  await expect(page.getByLabel("Script text")).toHaveValue(
    "Deterministic English long-video script.",
  );
  expect(await readContentCount(email)).toBe(1);
  const after = await readContentProviderTelemetry(page);
  expect(after.invocationCount - before.invocationCount).toBe(1);
  expect(after.lastRequestedLanguage).toBe("en");
  expect(after.lastRequestedFormat).toBe("LONG_VIDEO");
});

test("Idea Library cards do not expose first-generation Script UI", async ({ page }) => {
  const email = emailFor("content-eligibility").toLowerCase();
  await signUp(page, email);
  await createReadyContentDna(page);
  await page.goto("/en/ideas");
  await page.getByRole("button", { name: "Generate 20 Ideas" }).click();
  await expect(page.getByRole("heading", { name: "Ideas", exact: true })).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Generated ideas" }).locator(":scope > li"),
  ).toHaveCount(20);
  await page.goto("/en/ideas?view=all");

  const card = page.locator("article").first();
  await expect(card.getByRole("button", { name: "Generate Script" })).toHaveCount(0);
  await card.getByRole("button", { name: "Save for later" }).click();
  await expect(card.getByText("Saved for later", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Generate Script" })).toHaveCount(0);
  await card.getByRole("button", { name: "Reject" }).click();
  const rejectionDialog = page.getByRole("dialog", { name: "Reject this idea" });
  await rejectionDialog.getByRole("button", { name: "Reject idea" }).click();
  await expect(card.getByText("Rejected", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Generate Script" })).toHaveCount(0);
});

test("stale DNA conflict keeps the synchronous form safe and invokes no provider", async ({
  page,
}) => {
  const email = emailFor("content-stale-dna").toLowerCase();
  await signUp(page, email);
  await createReadyContentDna(page);
  await generateAndAcceptFirstIdea(page);
  const dialog = await openScriptDialog(page);
  const before = await readContentProviderTelemetry(page);

  const dnaPage = await page.context().newPage();
  await dnaPage.goto("/en/content-dna");
  await dnaPage.getByLabel("Creator or brand description").fill("An updated education creator.");
  await dnaPage.getByRole("button", { name: "Save Content DNA" }).click();
  await expect(dnaPage.getByText("AI-ready", { exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "Generate Script" }).click();
  await expect(
    dialog.getByText("This form was opened against an older Content DNA version."),
  ).toBeVisible();
  expect(await readContentProviderTelemetry(page)).toEqual(before);
  await dialog.getByRole("button", { name: "Reload current state" }).click();
  await expect(page.getByRole("dialog", { name: "Generate a Script" })).toHaveCount(0);
  await dnaPage.close();
});

test("provider failure is retained and Ticket 07 retry redirects after synchronous success", async ({
  page,
}) => {
  const email = emailFor("content-provider-retry").toLowerCase();
  await signUp(page, email);
  await createReadyContentDna(page);
  await generateAndAcceptFirstIdea(page);
  await setContentProviderScenario(page, "provider-unavailable");
  await openScriptDialog(page);
  await submitScript(page, { instructions: "Keep the examples concrete." });

  const dialog = page.getByRole("dialog", { name: "Generate a Script" });
  await expect(dialog.getByText("The invoked service did not return a safe result.")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).last().click();
  const card = page
    .getByRole("list", { name: "Ideas in the Production Queue" })
    .locator(":scope > li")
    .first();
  await expect(card.getByText("The last generation failed. Retry when ready.")).toBeVisible();
  await expect(card.getByRole("button", { name: "Retry" })).toBeVisible();

  await setContentProviderScenario(page, "success");
  await card.getByRole("button", { name: "Retry" }).click();
  await expect(page).toHaveURL(/\/en\/content\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Script editor" })).toBeVisible();
  expect(await readContentCount(email)).toBe(1);
});

test("workspace and provider rate-limit feedback remain distinct", async ({ page }) => {
  const workspaceEmail = emailFor("content-workspace-rate-limit").toLowerCase();
  await signUp(page, workspaceEmail);
  await createReadyContentDna(page);
  await generateAndAcceptFirstIdea(page);
  await setContentProviderScenario(page, "success");

  const owner = await findOwnerContentData(workspaceEmail);
  for (let index = 0; index < 2; index += 1) {
    await page.goto(`/en/content?ideaId=${owner.ideaId}`);
    await page.getByRole("button", { name: "Generate Another" }).click();
    await submitScript(page);
    await expect(page).toHaveURL(/\/en\/content\/[0-9a-f-]{36}$/);
  }

  await page.goto(`/en/content?ideaId=${owner.ideaId}`);
  await page.getByRole("button", { name: "Generate Another" }).click();
  const workspaceBefore = await readContentProviderTelemetry(page);
  await submitScript(page);
  const workspaceDialog = page.getByRole("dialog", { name: "Generate a Script" });
  await expect(
    workspaceDialog.getByText(/No Attempt was created and no provider call was made/),
  ).toBeVisible();
  expect(await readContentProviderTelemetry(page)).toEqual(workspaceBefore);

  const providerEmail = emailFor("content-provider-rate-limit").toLowerCase();
  const browser = page.context().browser();
  if (!browser) throw new Error("The browser context is unavailable for the rate-limit fixture.");
  const providerContext = await browser.newContext();
  const providerPage = await providerContext.newPage();
  await signUp(providerPage, providerEmail);
  await createReadyContentDna(providerPage);
  await generateAndAcceptFirstIdea(providerPage);
  await setContentProviderScenario(providerPage, "rate-limited");
  await openScriptDialog(providerPage);
  const providerBefore = await readContentProviderTelemetry(providerPage);
  await submitScript(providerPage);
  const providerDialog = providerPage.getByRole("dialog", { name: "Generate a Script" });
  await expect(
    providerDialog.getByText(/The provider was invoked and this Attempt was recorded as failed/),
  ).toBeVisible();
  expect((await readContentProviderTelemetry(providerPage)).invocationCount).toBe(
    providerBefore.invocationCount + 1,
  );
  await providerContext.close();
});

test("renders persisted PENDING and RUNNING Attempts without polling or provider work", async ({
  page,
}) => {
  const email = emailFor("content-active-history").toLowerCase();
  await signUp(page, email);
  await createReadyContentDna(page);
  await generateAndAcceptFirstIdea(page);
  await seedActiveAttempts(email);
  const before = await readContentProviderTelemetry(page);

  await page.goto(`/en/content?ideaId=${(await findOwnerContentData(email)).ideaId}`);
  const card = page.getByRole("region", { name: "Script generation history" });
  await expect(card.getByRole("heading", { name: "Script generation history" })).toBeVisible();
  await expect(card.getByText("Pending", { exact: true })).toBeVisible();
  await expect(card.getByText("Running", { exact: true })).toBeVisible();
  await expect(card.getByText(/This history view does not start provider work/)).toBeVisible();
  await expect(card.getByText(/This history view does not poll/)).toBeVisible();
  await page.waitForTimeout(300);
  expect(await readContentProviderTelemetry(page)).toEqual(before);
});

test("supports Persian RTL Script form keyboard focus and mixed-direction instructions", async ({
  page,
}) => {
  const email = emailFor("content-rtl").toLowerCase();
  await signUp(page, email);
  await createReadyContentDna(page, "Persian");
  await page.goto("/fa/ideas");
  await page.getByRole("button", { name: "تولید ۲۰ ایده" }).click();
  await expect(page.getByRole("list", { name: "ایده‌های تولیدشده" })).toBeVisible();
  const card = page.locator("article").first();
  await card.getByRole("button", { name: "پذیرش" }).click();
  await page.goto("/fa/content");
  const queueItem = page
    .getByRole("list", { name: "ایده‌های صف تولید" })
    .locator(":scope > li")
    .first();
  const trigger = queueItem.getByRole("button", { name: "تولید" });
  await trigger.focus();
  await trigger.press("Enter");
  const dialog = page.getByRole("dialog", { name: "یک اسکریپت تولید کنید" });
  await expect(dialog).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fa");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(dialog.getByRole("combobox", { name: "زبان درخواستی" })).toBeFocused();
  await expect(dialog.getByRole("combobox", { name: "زبان درخواستی" })).toHaveText("فارسی");
  await expect(dialog.getByLabel("دستورها (اختیاری)")).toHaveAttribute("dir", "auto");
  await dialog.getByLabel("دستورها (اختیاری)").fill("English cue — راهنمای فارسی");
  await dialog.getByText(/\/۱٬۰۰۰ نویسه/).waitFor();
  await dialog.getByRole("button", { name: "لغو" }).last().click();
  await expect(trigger).toBeFocused();
});

test("persists mouse drag and keyboard queue ordering across refresh", async ({ page }) => {
  const email = emailFor("content-queue-order").toLowerCase();
  await signUp(page, email);
  await createReadyContentDna(page);
  await generateAndAcceptIdeas(page, 3);

  const queue = page.getByRole("list", { name: "Ideas in the Production Queue" });
  const initialTitles = await queue.locator("h3").allTextContents();
  expect(initialTitles).toHaveLength(3);
  await queue.locator(":scope > li").nth(0).dragTo(queue.locator(":scope > li").nth(2));
  await expect(queue.locator("h3")).toHaveText([
    initialTitles[1]!,
    initialTitles[2]!,
    initialTitles[0]!,
  ]);
  await page.reload();
  await expect(queue.locator("h3")).toHaveText([
    initialTitles[1]!,
    initialTitles[2]!,
    initialTitles[0]!,
  ]);

  await expect(queue.getByRole("button", { name: /Move Idea up|Move Idea down/ })).toHaveCount(0);
  const keyboardHandle = queue.locator(":scope > li").nth(1).locator('[role="button"]').first();
  await keyboardHandle.focus();
  await keyboardHandle.press("ArrowUp");
  await expect(queue.locator("h3")).toHaveText([
    initialTitles[2]!,
    initialTitles[1]!,
    initialTitles[0]!,
  ]);
  await page.reload();
  await expect(queue.locator("h3")).toHaveText([
    initialTitles[2]!,
    initialTitles[1]!,
    initialTitles[0]!,
  ]);
});

test("removes queued Ideas through Save and Reject decisions", async ({ page }) => {
  const saveEmail = emailFor("content-queue-save").toLowerCase();
  await signUp(page, saveEmail);
  await createReadyContentDna(page);
  await generateAndAcceptFirstIdea(page);
  const queue = page.getByRole("list", { name: "Ideas in the Production Queue" });
  await queue
    .locator(":scope > li")
    .first()
    .getByRole("button", { name: "Save for later" })
    .click();
  await expect(page.getByText("Your queue is clear")).toBeVisible();

  const rejectEmail = emailFor("content-queue-reject").toLowerCase();
  await signUp(page, rejectEmail);
  await createReadyContentDna(page);
  await generateAndAcceptFirstIdea(page);
  const rejectQueue = page.getByRole("list", { name: "Ideas in the Production Queue" });
  await rejectQueue.locator(":scope > li").first().getByRole("button", { name: "Reject" }).click();
  const rejectionDialog = page.getByRole("dialog", { name: "Reject this idea" });
  await rejectionDialog.getByLabel("Reason (optional)").fill("Not a fit right now.");
  await rejectionDialog.getByRole("button", { name: "Reject idea" }).click();
  await expect(page.getByText("Your queue is clear")).toBeVisible();
});

test("opens source-Idea Content context and creates distinct Generate Another records", async ({
  page,
}) => {
  const email = emailFor("content-by-idea").toLowerCase();
  await signUp(page, email);
  await createReadyContentDna(page);
  await generateAndAcceptFirstIdea(page);
  await setContentProviderScenario(page, "success");
  await openScriptDialog(page);
  await submitScript(page);
  await expect(page).toHaveURL(/\/en\/content\/[0-9a-f-]{36}$/);

  const owner = await findOwnerContentData(email);
  await page.goto(`/en/content?ideaId=${owner.ideaId}`);
  await expect(page.getByText("Source Idea context")).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate Another" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Open Script editor/ })).toHaveCount(1);

  await page.getByRole("button", { name: "Generate Another" }).click();
  await submitScript(page, { format: "Long video" });
  await expect(page).toHaveURL(/\/en\/content\/[0-9a-f-]{36}$/);
  await page.goto(`/en/content?ideaId=${owner.ideaId}`);
  await expect(page.getByRole("link", { name: /Open Script editor/ })).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "Script generation history" })).toBeVisible();
});

test("links accepted Idea Library Content counts back to the source context on mobile", async ({
  page,
}) => {
  const email = emailFor("content-library-link").toLowerCase();
  await signUp(page, email);
  await createReadyContentDna(page);
  await generateAndAcceptFirstIdea(page);
  await setContentProviderScenario(page, "success");
  await openScriptDialog(page);
  await submitScript(page);
  const owner = await findOwnerContentData(email);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/ideas?view=accepted");
  const card = page.locator("article").first();
  await expect(card.getByText("1 Content", { exact: true })).toBeVisible();
  await expect(card.getByRole("link")).toHaveAttribute(
    "href",
    `/en/content?ideaId=${owner.ideaId}`,
  );
  await expect(card.getByRole("button", { name: "Generate Script" })).toHaveCount(0);
});
