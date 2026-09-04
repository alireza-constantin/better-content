import { Client } from "pg";
import { expect, test, type Page } from "@playwright/test";

const password = "e2e-password-123";
let nextE2eClientIp = 32;

function emailFor(testName: string): string {
  return `${testName}-${crypto.randomUUID()}@example.test`;
}

async function signUp(page: Page, email: string, locale: "en" | "fa" = "en"): Promise<void> {
  const english = locale === "en";
  nextE2eClientIp = (nextE2eClientIp % 254) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `192.0.2.${nextE2eClientIp}` });

  await page.goto(`/${locale}/sign-up`);
  await page.getByLabel(english ? "Name" : "نام کاربری").fill("Content Creator");
  await page.getByLabel(english ? "Email address" : "نشانی ایمیل").fill(email);
  await page.getByLabel(english ? "Password" : "رمز عبور").fill(password);
  await page.getByRole("button", { name: english ? "Create account" : "ایجاد حساب" }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/dashboard$`));
}

type SeededContent = Readonly<{
  englishContentId: string;
  persianContentId: string;
  emptyContentId: string;
}>;

type ContentFixture = Readonly<{
  id: keyof SeededContent;
  language: "en" | "fa";
  format: "SHORT_VIDEO" | "LONG_VIDEO";
  text: string;
  updatedAt: string;
}>;

const contentFixtures: readonly ContentFixture[] = [
  {
    id: "englishContentId",
    language: "en",
    format: "SHORT_VIDEO",
    text: "Initial English script",
    updatedAt: "2026-09-03T10:00:00.000Z",
  },
  {
    id: "persianContentId",
    language: "fa",
    format: "LONG_VIDEO",
    text: "متن فارسی / English 42",
    updatedAt: "2026-09-02T10:00:00.000Z",
  },
  {
    id: "emptyContentId",
    language: "en",
    format: "SHORT_VIDEO",
    text: "",
    updatedAt: "2026-09-01T10:00:00.000Z",
  },
];

async function seedContent(email: string): Promise<SeededContent> {
  const databaseUrl = process.env.E2E_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("E2E_DATABASE_URL is required to seed the Content browser fixture.");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const ownerResult = await client.query<{ user_id: string; workspace_id: string }>(
      `SELECT u.id AS user_id, wm.workspace_id
       FROM "user" u
       INNER JOIN workspace_members wm ON wm.user_id = u.id
       WHERE u.email = $1`,
      [email],
    );
    const owner = ownerResult.rows[0];

    if (!owner) {
      throw new Error("The Content browser fixture owner was not found.");
    }

    const contentDnaId = crypto.randomUUID();
    const contentDnaVersionId = crypto.randomUUID();
    const ideaRunId = crypto.randomUUID();
    const ideaBatchId = crypto.randomUUID();
    const ideaId = crypto.randomUUID();
    const settings = {
      structuredOutput: { schemaName: "idea_generation_v1", schemaVersion: 1 },
      reasoningEffort: "medium",
      maxOutputTokens: 16_000,
      timeoutSeconds: 60,
      retryPolicy: { maxRetries: 0 },
      serviceTier: "default",
    };
    const contentDnaPayload = {
      schemaVersion: 1,
      identity: { creatorOrBrandDescription: "Deterministic browser fixture" },
      language: { defaultContentLanguage: "en", contentLanguages: ["en", "fa"] },
    };

    await client.query("BEGIN");

    await client.query(
      `INSERT INTO content_dna (id, workspace_id, current_version_id)
       VALUES ($1, $2, $3)`,
      [contentDnaId, owner.workspace_id, contentDnaVersionId],
    );
    await client.query(
      `INSERT INTO content_dna_versions
        (id, content_dna_id, version_number, payload, created_by_user_id)
       VALUES ($1, $2, 1, $3::jsonb, $4)`,
      [contentDnaVersionId, contentDnaId, JSON.stringify(contentDnaPayload), owner.user_id],
    );
    await client.query(
      `INSERT INTO ai_runs
        (id, workspace_id, kind, provider, model, prompt_version, generation_settings, status,
         output_snapshot, usage, started_at, completed_at)
       VALUES ($1, $2, 'IDEA_GENERATION', 'avalai', 'gpt-5.6-luna', 'idea-generation/v1',
         $3::jsonb, 'COMPLETED', $4::jsonb, $5::jsonb, NOW(), NOW())`,
      [
        ideaRunId,
        owner.workspace_id,
        JSON.stringify(settings),
        JSON.stringify({ schemaVersion: 1, ideas: [] }),
        JSON.stringify({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }),
      ],
    );
    await client.query(
      `INSERT INTO idea_generation_batches
        (id, workspace_id, content_dna_version_id, ai_run_id, idempotency_key,
         request_fingerprint, requested_language, requested_count, status, started_at, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'en', 20, 'COMPLETED', NOW(), NOW())`,
      [
        ideaBatchId,
        owner.workspace_id,
        contentDnaVersionId,
        ideaRunId,
        crypto.randomUUID(),
        "b".repeat(64),
      ],
    );
    await client.query(
      `INSERT INTO ideas
        (id, batch_id, position, title, description, category, language, status)
       VALUES ($1, $2, 1, $3, $4, $5, 'en', 'ACCEPTED')`,
      [
        ideaId,
        ideaBatchId,
        "Deterministic Content idea",
        "A persisted source idea for browser acceptance.",
        "Education",
      ],
    );

    const seededIds: {
      englishContentId?: string;
      persianContentId?: string;
      emptyContentId?: string;
    } = {};

    for (const fixture of contentFixtures) {
      const contentId = crypto.randomUUID();
      const attemptId = crypto.randomUUID();
      const aiRunId = crypto.randomUUID();
      const document = {
        schemaVersion: 1,
        script: { text: fixture.text },
      };
      const contentSettings = {
        structuredOutput: { schemaName: "content_script_generation_v1", schemaVersion: 1 },
        reasoningEffort: "medium",
        maxOutputTokens: 16_000,
        timeoutSeconds: 90,
        retryPolicy: { maxRetries: 0 },
        serviceTier: "default",
      };

      await client.query(
        `INSERT INTO ai_runs
          (id, workspace_id, kind, provider, model, prompt_version, generation_settings, status,
           output_snapshot, usage, started_at, completed_at)
         VALUES ($1, $2, 'CONTENT_SCRIPT_GENERATION', 'avalai', 'gpt-5.6-luna',
           'content-script-generation/v1', $3::jsonb, 'COMPLETED', $4::jsonb, $5::jsonb, NOW(), NOW())`,
        [
          aiRunId,
          owner.workspace_id,
          JSON.stringify(contentSettings),
          JSON.stringify(document),
          JSON.stringify({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }),
        ],
      );
      await client.query(
        `INSERT INTO content_generation_attempts
          (id, workspace_id, source_idea_id, content_dna_version_id, requested_language, format,
           instructions, idempotency_key, request_fingerprint, ai_run_id, status,
           started_at, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, $9, 'COMPLETED', NOW(), NOW())`,
        [
          attemptId,
          owner.workspace_id,
          ideaId,
          contentDnaVersionId,
          fixture.language,
          fixture.format,
          crypto.randomUUID(),
          "c".repeat(64),
          aiRunId,
        ],
      );
      await client.query(
        `INSERT INTO contents
          (id, workspace_id, source_idea_id, content_language, format, source_generation_attempt_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [contentId, owner.workspace_id, ideaId, fixture.language, fixture.format, attemptId],
      );
      await client.query(
        `INSERT INTO content_versions
          (content_id, version_number, document, source, ai_run_id, created_by_user_id)
         VALUES ($1, 1, $2::jsonb, 'AI_GENERATED', $3, $4)`,
        [contentId, JSON.stringify(document), aiRunId, owner.user_id],
      );
      await client.query(
        `INSERT INTO content_drafts
          (content_id, document, revision, created_at, updated_at)
         VALUES ($1, $2::jsonb, 1, $3::timestamptz, $3::timestamptz)`,
        [contentId, JSON.stringify(document), fixture.updatedAt],
      );

      seededIds[fixture.id] = contentId;
    }

    await client.query("COMMIT");

    if (!seededIds.englishContentId || !seededIds.persianContentId || !seededIds.emptyContentId) {
      throw new Error("The Content browser fixture did not create every expected Content item.");
    }

    return seededIds as SeededContent;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

test("opens the persisted Content list and saves an empty Draft through the real editor", async ({
  page,
}) => {
  const email = emailFor("content-list-editor").toLowerCase();
  const fixturePromise = (async () => {
    await signUp(page, email);
    return seedContent(email);
  })();
  const fixture = await fixturePromise;

  await page.goto("/en/content");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { name: "Content workspace" })).toBeVisible();
  const contentList = page.getByRole("list", { name: "Content Drafts" });
  const contentRows = contentList.getByRole("listitem");
  await expect(contentRows).toHaveCount(3);
  await expect(contentRows.nth(0)).toContainText("Short video");
  await expect(contentRows.nth(1)).toContainText("Persian");
  await expect(contentRows.nth(2)).toContainText("Edited");

  await contentList.getByRole("link").nth(2).click();
  await expect(page).toHaveURL(new RegExp(`/en/content/${fixture.emptyContentId}$`));
  await expect(page.getByRole("textbox", { name: "Script text" })).toHaveValue("");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page
    .getByRole("textbox", { name: "Script text" })
    .fill("Persisted from the browser editor");
  await expect(page.getByText("Revision 2", { exact: true })).toBeVisible({ timeout: 5_000 });

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Script text" })).toHaveValue(
    "Persisted from the browser editor",
  );
  await expect(page.getByText("Revision 2", { exact: true })).toBeVisible();
});

test("serializes rapid edits and sends only the latest local value after the first save", async ({
  page,
}) => {
  const email = emailFor("content-rapid-edits").toLowerCase();
  await signUp(page, email);
  const fixture = await seedContent(email);
  await page.goto(`/en/content/${fixture.englishContentId}`);

  let postCount = 0;
  let releaseFirstSave!: () => void;
  let firstSaveSeenResolve!: () => void;
  const firstSaveSeen = new Promise<void>((resolve) => {
    firstSaveSeenResolve = resolve;
  });
  const firstSaveRelease = new Promise<void>((resolve) => {
    releaseFirstSave = resolve;
  });

  await page.route(`**/content/${fixture.englishContentId}`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    postCount += 1;
    if (postCount === 1) {
      firstSaveSeenResolve();
      await firstSaveRelease;
    }
    await route.continue();
  });

  try {
    const field = page.getByRole("textbox", { name: "Script text" });
    await field.fill("A");
    await page.waitForTimeout(1_050);
    await expect.poll(() => postCount, { timeout: 5_000 }).toBe(1);
    await firstSaveSeen;

    await field.fill("B");
    await field.fill("C");
    await field.fill("D");
    releaseFirstSave();

    await expect(page.getByText("Revision 3", { exact: true })).toBeVisible({ timeout: 8_000 });
    expect(postCount).toBe(2);
    await page.reload();
    await expect(field).toHaveValue("D");
  } finally {
    await page.unroute(`**/content/${fixture.englishContentId}`);
  }
});

test("preserves local text after a failed save and retries only after explicit action", async ({
  page,
}) => {
  const email = emailFor("content-save-failure").toLowerCase();
  await signUp(page, email);
  const fixture = await seedContent(email);
  await page.goto(`/en/content/${fixture.englishContentId}`);

  const routePattern = `**/content/${fixture.englishContentId}`;
  await page.route(routePattern, async (route) => {
    if (route.request().method() === "POST") {
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  const localText = "Keep this complete local text";
  await page.getByRole("textbox", { name: "Script text" }).fill(localText);
  await expect(page.getByText("Your Script was not saved", { exact: true })).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByRole("textbox", { name: "Script text" })).toHaveValue(localText);
  await page.waitForTimeout(1_800);
  await expect(page.getByRole("button", { name: "Retry save" })).toBeVisible();

  await page.unroute(routePattern);
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(page.getByText("Revision 2", { exact: true })).toBeVisible({ timeout: 5_000 });
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Script text" })).toHaveValue(localText);
});

test("preserves a stale tab, supports Copy, and reloads authoritative text without merging", async ({
  context,
  page,
}) => {
  const email = emailFor("content-conflict").toLowerCase();
  await signUp(page, email);
  const fixture = await seedContent(email);
  const stalePage = await context.newPage();
  await stalePage.goto(`/en/content/${fixture.englishContentId}`);
  await page.goto(`/en/content/${fixture.englishContentId}`);

  const authoritativeText = "Authoritative tab text";
  await page.getByRole("textbox", { name: "Script text" }).fill(authoritativeText);
  await expect(page.getByText("Revision 2", { exact: true })).toBeVisible({ timeout: 5_000 });

  const staleText = "Stale tab text that must not be merged";
  await stalePage.getByRole("textbox", { name: "Script text" }).fill(staleText);
  await expect(stalePage.getByText("This Draft changed elsewhere", { exact: true })).toBeVisible({
    timeout: 5_000,
  });
  await expect(stalePage.getByRole("textbox", { name: "Script text" })).toHaveValue(staleText);

  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(stalePage.url()).origin,
  });
  await stalePage.getByRole("button", { name: "Copy unsaved text" }).click();
  await expect(stalePage.getByText("Unsaved text copied.", { exact: true })).toBeVisible();
  await expect(stalePage.evaluate(() => navigator.clipboard.readText())).resolves.toBe(staleText);

  await stalePage.getByRole("button", { name: "Reload authoritative Draft" }).click();
  await expect(stalePage.getByRole("textbox", { name: "Script text" })).toHaveValue(
    authoritativeText,
  );
  await expect(stalePage.getByText("Saved", { exact: true })).toBeVisible();
  await expect(stalePage.getByText("Revision 2", { exact: true })).toBeVisible();
  await stalePage.close();
});

test("keeps Content language direction independent from route locale and preserves mixed bidi text", async ({
  page,
}) => {
  const email = emailFor("content-language-direction").toLowerCase();
  await signUp(page, email);
  const fixture = await seedContent(email);

  await page.goto(`/en/content/${fixture.persianContentId}`);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("textbox", { name: "Script text" })).toHaveAttribute("lang", "fa");
  await expect(page.getByRole("textbox", { name: "Script text" })).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("textbox", { name: "Script text" })).toHaveValue(
    "متن فارسی / English 42",
  );

  await page.goto(`/fa/content/${fixture.englishContentId}`);
  await expect(page.locator("html")).toHaveAttribute("lang", "fa");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("textbox", { name: "متن اسکریپت" })).toHaveAttribute("lang", "en");
  await expect(page.getByRole("textbox", { name: "متن اسکریپت" })).toHaveAttribute("dir", "ltr");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    await page.locator("body").evaluate((body) => body.clientWidth),
  );
});
