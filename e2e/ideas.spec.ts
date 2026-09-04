import { Client } from "pg";
import { expect, test, type Page } from "@playwright/test";

const password = "e2e-password-123";
const e2eProviderScenarioCookie = "better-content-e2e-provider-scenario";
let nextE2eClientIp = 0;

function emailFor(testName: string): string {
  return `${testName}-${crypto.randomUUID()}@example.test`;
}

async function signUp(page: Page, email: string, locale: "en" | "fa" = "en"): Promise<void> {
  const english = locale === "en";
  nextE2eClientIp = (nextE2eClientIp % 254) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `192.0.2.${nextE2eClientIp}` });

  await page.goto(`/${locale}/sign-up`);
  await page.getByLabel(english ? "Name" : "نام").fill("Ideas Creator");
  await page.getByLabel(english ? "Email address" : "نشانی ایمیل").fill(email);
  await page.getByLabel(english ? "Password" : "رمز عبور").fill(password);
  await page.getByRole("button", { name: english ? "Create account" : "ایجاد حساب" }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/dashboard$`));
}

async function createReadyContentDna(page: Page): Promise<void> {
  await page.goto("/en/content-dna");
  await page.getByLabel("Creator or brand description").fill("A practical education creator.");
  await page.getByLabel("Target audience description").fill("Independent creators.");
  await page.getByLabel("Primary topics, item 1").fill("Content strategy");
  await page.getByLabel("Tone traits, item 1").fill("Practical");
  await page.getByLabel("Content goals, item 1").fill("Help creators make better decisions");
  await page.getByRole("combobox", { name: "Default content language" }).click();
  await page.getByRole("option", { name: "English" }).click();
  await page.getByRole("checkbox", { name: "English" }).check();
  await page.getByRole("checkbox", { name: "Persian" }).check();
  await page.getByRole("button", { name: "Save Content DNA" }).click();
  await expect(page.getByText("AI-ready", { exact: true })).toBeVisible();
}

async function setE2eProviderScenario(
  page: Page,
  scenario: "provider-unavailable" | "success",
): Promise<void> {
  await page.context().addCookies([
    {
      name: e2eProviderScenarioCookie,
      value: scenario,
      url: "http://127.0.0.1:3100",
    },
  ]);
}

type SeededBatch = Readonly<{
  batchId: string;
  firstIdeaTitle: string;
}>;

type SeedBatchOptions = Readonly<{
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  language?: "en" | "fa";
  errorCategory?:
    | "TIMEOUT"
    | "RATE_LIMITED"
    | "PROVIDER_UNAVAILABLE"
    | "INVALID_OUTPUT"
    | "INTERRUPTED"
    | "UNKNOWN";
}>;

type PersistedGeneration = Readonly<{
  batchCount: number;
  runCount: number;
  ideaCount: number;
  batchStatus: string | null;
  runStatus: string | null;
  requestedLanguage: string | null;
  ideaLanguages: string[];
  firstIdeaTitle: string | null;
}>;

type E2eProviderTelemetry = Readonly<{
  invocationCount: number;
  lastRequestedLanguage: "en" | "fa" | null;
  lastRequestedCount: 20 | null;
}>;

async function seedCompletedPersianBatch(email: string): Promise<void> {
  const databaseUrl = process.env.E2E_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("E2E_DATABASE_URL is required to seed the Ideas browser fixture.");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const result = await client.query<{ workspace_id: string; version_id: string }>(
      `SELECT wm.workspace_id, cdv.id AS version_id
       FROM "user" u
       INNER JOIN workspace_members wm ON wm.user_id = u.id
       INNER JOIN content_dna cd ON cd.workspace_id = wm.workspace_id
       INNER JOIN content_dna_versions cdv ON cdv.id = cd.current_version_id
       WHERE u.email = $1`,
      [email],
    );
    const owner = result.rows[0];

    if (!owner) {
      throw new Error("The browser fixture owner was not found.");
    }

    const runId = crypto.randomUUID();
    const batchId = crypto.randomUUID();
    const idempotencyKey = crypto.randomUUID();
    const title = "چطور لباس گران همیشه شیک نیست";
    const description = "نشانه‌های بصری ارزشمند بودن لباس همیشه به قیمت آن وابسته نیستند.";
    const category = "منابع";
    const output = {
      schemaVersion: 1,
      ideas: Array.from({ length: 20 }, (_, index) => ({
        title: index === 0 ? title : `ایدهٔ فارسی ${index + 1}`,
        description: index === 0 ? description : `توضیح فارسی ایدهٔ ${index + 1}.`,
        category,
      })),
    };
    const settings = {
      structuredOutput: { schemaName: "idea_generation_v1", schemaVersion: 1 },
      reasoningEffort: "medium",
      maxOutputTokens: 16_000,
      timeoutSeconds: 60,
      retryPolicy: { maxRetries: 0 },
      serviceTier: "default",
    };

    await client.query(
      `INSERT INTO ai_runs
        (id, workspace_id, kind, provider, model, prompt_version, generation_settings, status,
         output_snapshot, usage, started_at, completed_at)
       VALUES ($1, $2, 'IDEA_GENERATION', 'avalai', 'gpt-5.6-luna', 'idea-generation/v1',
         $3::jsonb, 'COMPLETED', $4::jsonb, $5::jsonb, NOW(), NOW())`,
      [
        runId,
        owner.workspace_id,
        JSON.stringify(settings),
        JSON.stringify(output),
        JSON.stringify({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }),
      ],
    );

    await client.query(
      `INSERT INTO idea_generation_batches
        (id, workspace_id, content_dna_version_id, ai_run_id, idempotency_key,
         request_fingerprint, requested_language, requested_count, status, started_at, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'fa', 20, 'COMPLETED', NOW(), NOW())`,
      [batchId, owner.workspace_id, owner.version_id, runId, idempotencyKey, "a".repeat(64)],
    );

    const values: unknown[] = [];
    const rows = Array.from({ length: 20 }, (_, index) => {
      const valueOffset = index * 9;
      const seededIdea = output.ideas[index];
      values.push(
        crypto.randomUUID(),
        batchId,
        index + 1,
        seededIdea?.title,
        seededIdea?.description,
        category,
        "fa",
        index === 0 ? "REJECTED" : "NEW",
        index === 0 ? "Already covered" : null,
      );
      return `($${valueOffset + 1}, $${valueOffset + 2}, $${valueOffset + 3}, $${valueOffset + 4}, $${valueOffset + 5}, $${valueOffset + 6}, $${valueOffset + 7}, $${valueOffset + 8}, $${valueOffset + 9}, NOW(), NOW())`;
    });

    await client.query(
      `INSERT INTO ideas
        (id, batch_id, position, title, description, category, language, status,
         rejection_reason, created_at, updated_at)
       VALUES ${rows.join(", ")}`,
      values,
    );
  } finally {
    await client.end();
  }
}

async function seedBatch(email: string, options: SeedBatchOptions): Promise<SeededBatch> {
  const databaseUrl = process.env.E2E_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("E2E_DATABASE_URL is required to seed the Ideas browser fixture.");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const result = await client.query<{ workspace_id: string; version_id: string }>(
      `SELECT wm.workspace_id, cdv.id AS version_id
       FROM "user" u
       INNER JOIN workspace_members wm ON wm.user_id = u.id
       INNER JOIN content_dna cd ON cd.workspace_id = wm.workspace_id
       INNER JOIN content_dna_versions cdv ON cdv.id = cd.current_version_id
       WHERE u.email = $1`,
      [email],
    );
    const owner = result.rows[0];

    if (!owner) {
      throw new Error("The browser fixture owner was not found.");
    }

    const runId = crypto.randomUUID();
    const batchId = crypto.randomUUID();
    const idempotencyKey = crypto.randomUUID();
    const language = options.language ?? "en";
    const isCompleted = options.status === "COMPLETED";
    const isPending = options.status === "PENDING";
    const isFailed = options.status === "FAILED";
    const errorCategory = isFailed ? (options.errorCategory ?? "UNKNOWN") : null;
    const firstIdeaTitle =
      language === "fa" ? "چطور لباس گران همیشه شیک نیست" : "Deterministic idea 1";
    const description =
      language === "fa"
        ? "نشانه‌های بصری ارزشمند بودن لباس همیشه به قیمت آن وابسته نیستند."
        : "Deterministic description for browser acceptance.";
    const category = language === "fa" ? "منابع" : "Education";
    const output = isCompleted
      ? {
          schemaVersion: 1,
          ideas: Array.from({ length: 20 }, (_, index) => ({
            title:
              index === 0
                ? firstIdeaTitle
                : language === "fa"
                  ? `ایدهٔ فارسی ${index + 1}`
                  : `Deterministic idea ${index + 1}`,
            description:
              index === 0
                ? description
                : language === "fa"
                  ? `توضیح فارسی ایدهٔ ${index + 1}.`
                  : `Deterministic description ${index + 1}.`,
            category,
          })),
        }
      : null;
    const settings = {
      structuredOutput: { schemaName: "idea_generation_v1", schemaVersion: 1 },
      reasoningEffort: "medium",
      maxOutputTokens: 16_000,
      timeoutSeconds: 60,
      retryPolicy: { maxRetries: 0 },
      serviceTier: "default",
    };

    await client.query(
      `INSERT INTO ai_runs
        (id, workspace_id, kind, provider, model, prompt_version, generation_settings, status,
         error_category, output_snapshot, usage, started_at, completed_at, failed_at)
       VALUES ($1, $2, 'IDEA_GENERATION', 'avalai', 'gpt-5.6-luna', 'idea-generation/v1',
         $3::jsonb, $4, $5, $6::jsonb, $7::jsonb,
         CASE WHEN $8 THEN NULL ELSE NOW() END,
         CASE WHEN $9 THEN NOW() ELSE NULL END,
         CASE WHEN $10 THEN NOW() ELSE NULL END)`,
      [
        runId,
        owner.workspace_id,
        JSON.stringify(settings),
        options.status,
        errorCategory,
        output ? JSON.stringify(output) : null,
        isCompleted ? JSON.stringify({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }) : null,
        isPending,
        isCompleted,
        isFailed,
      ],
    );

    await client.query(
      `INSERT INTO idea_generation_batches
        (id, workspace_id, content_dna_version_id, ai_run_id, idempotency_key,
         request_fingerprint, requested_language, requested_count, status, error_category,
         started_at, completed_at, failed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 20, $8, $9,
         CASE WHEN $10 THEN NULL ELSE NOW() END,
         CASE WHEN $11 THEN NOW() ELSE NULL END,
         CASE WHEN $12 THEN NOW() ELSE NULL END)`,
      [
        batchId,
        owner.workspace_id,
        owner.version_id,
        runId,
        idempotencyKey,
        "a".repeat(64),
        language,
        options.status,
        errorCategory,
        isPending,
        isCompleted,
        isFailed,
      ],
    );

    if (output) {
      for (const [index, seededIdea] of output.ideas.entries()) {
        await client.query(
          `INSERT INTO ideas
            (id, batch_id, position, title, description, category, language, status,
             rejection_reason, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'NEW', NULL, NOW(), NOW())`,
          [
            crypto.randomUUID(),
            batchId,
            index + 1,
            seededIdea.title,
            seededIdea.description,
            category,
            language,
          ],
        );
      }
    }

    await client.query(
      `INSERT INTO workspace_generation_quota_reservations
        (workspace_id, batch_id, reserved_at, invoked_at)
       VALUES ($1, $2, NOW(), CASE WHEN $3 THEN NULL ELSE NOW() END)`,
      [owner.workspace_id, batchId, isPending],
    );

    return { batchId, firstIdeaTitle };
  } finally {
    await client.end();
  }
}

async function countBatches(email: string): Promise<number> {
  const databaseUrl = process.env.E2E_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("E2E_DATABASE_URL is required to count Ideas browser fixtures.");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const result = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM idea_generation_batches igb
       INNER JOIN workspace_members wm ON wm.workspace_id = igb.workspace_id
       INNER JOIN "user" u ON u.id = wm.user_id
       WHERE u.email = $1`,
      [email],
    );

    return Number(result.rows[0]?.count ?? 0);
  } finally {
    await client.end();
  }
}

async function readPersistedGeneration(email: string): Promise<PersistedGeneration> {
  const databaseUrl = process.env.E2E_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("E2E_DATABASE_URL is required to inspect Ideas browser fixtures.");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const result = await client.query<{
      batch_count: string;
      run_count: string;
      idea_count: string;
      batch_status: string | null;
      run_status: string | null;
      requested_language: string | null;
      idea_languages: string[] | null;
      first_idea_title: string | null;
    }>(
      `SELECT count(DISTINCT igb.id)::text AS batch_count,
              count(DISTINCT ar.id)::text AS run_count,
              count(i.id)::text AS idea_count,
              min(igb.status) AS batch_status,
              min(ar.status) AS run_status,
              min(igb.requested_language) AS requested_language,
              array_agg(DISTINCT i.language ORDER BY i.language)
                FILTER (WHERE i.id IS NOT NULL) AS idea_languages,
              min(i.title) FILTER (WHERE i.position = 1) AS first_idea_title
       FROM idea_generation_batches igb
       INNER JOIN ai_runs ar ON ar.id = igb.ai_run_id
       LEFT JOIN ideas i ON i.batch_id = igb.id
       INNER JOIN workspace_members wm ON wm.workspace_id = igb.workspace_id
       INNER JOIN "user" u ON u.id = wm.user_id
       WHERE u.email = $1`,
      [email],
    );
    const row = result.rows[0];

    if (!row) {
      throw new Error("The persisted generation fixture was not found.");
    }

    return {
      batchCount: Number(row.batch_count),
      runCount: Number(row.run_count),
      ideaCount: Number(row.idea_count),
      batchStatus: row.batch_status,
      runStatus: row.run_status,
      requestedLanguage: row.requested_language,
      ideaLanguages: row.idea_languages ?? [],
      firstIdeaTitle: row.first_idea_title,
    };
  } finally {
    await client.end();
  }
}

async function readE2eProviderTelemetry(page: Page): Promise<E2eProviderTelemetry> {
  const response = await page.request.get("/api/e2e/provider-telemetry");

  expect(response.ok()).toBe(true);
  return (await response.json()) as E2eProviderTelemetry;
}

test("shows the localized Ideas setup state in both directions", async ({ page }) => {
  await signUp(page, emailFor("ideas").toLowerCase());

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

test("completes deterministic browser generation and persists exactly 20 ideas", async ({
  page,
}) => {
  const email = emailFor("ideas-browser-generation").toLowerCase();
  let avalaiRequests = 0;

  await signUp(page, email);
  await createReadyContentDna(page);
  await page.route("https://api.avalai.ir/**", async (route) => {
    avalaiRequests += 1;
    await route.abort();
  });
  await page.goto("/en/ideas");
  const telemetryBefore = await readE2eProviderTelemetry(page);

  const generateButton = page.getByRole("button", { name: "Generate 20 Ideas" });
  await expect(generateButton).toBeEnabled();
  await generateButton.click();

  await expect(
    page.getByText("Generation finished. Your latest batch is ready to review.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ideas", exact: true })).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Generated ideas" }).locator(":scope > li"),
  ).toHaveCount(20);
  await expect(page.locator("aside").getByText("Completed", { exact: true })).toBeVisible();

  expect(await readPersistedGeneration(email)).toEqual({
    batchCount: 1,
    runCount: 1,
    ideaCount: 20,
    batchStatus: "COMPLETED",
    runStatus: "COMPLETED",
    requestedLanguage: "en",
    ideaLanguages: ["en"],
    firstIdeaTitle: "Deterministic idea 1",
  });
  expect(avalaiRequests).toBe(0);
  const telemetryAfter = await readE2eProviderTelemetry(page);
  expect(telemetryAfter.invocationCount - telemetryBefore.invocationCount).toBe(1);
  expect(telemetryAfter.lastRequestedLanguage).toBe("en");
  expect(telemetryAfter.lastRequestedCount).toBe(20);
});

test("uses keyboard for generation and decision controls", async ({ page }) => {
  const email = emailFor("ideas-keyboard").toLowerCase();

  await signUp(page, email);
  await createReadyContentDna(page);
  await page.goto("/en/ideas");

  const generateButton = page.getByRole("button", { name: "Generate 20 Ideas" });
  await generateButton.focus();
  await expect(generateButton).toBeFocused();
  await generateButton.press("Enter");
  await expect(page.getByRole("heading", { name: "Ideas", exact: true })).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Generated ideas" }).locator(":scope > li"),
  ).toHaveCount(20);
  await expect(generateButton).toBeEnabled();
  await expect(generateButton).toBeFocused();

  const firstCard = page.locator("article").first();
  const acceptButton = firstCard.getByRole("button", { name: "Accept" });
  await acceptButton.focus();
  await acceptButton.press("Enter");
  await expect(acceptButton).toHaveAttribute("aria-pressed", "true");
  await expect(firstCard.getByText("Accepted", { exact: true })).toBeVisible();

  const saveButton = firstCard.getByRole("button", { name: "Save for later" });
  await saveButton.focus();
  await saveButton.press("Space");
  await expect(saveButton).toHaveAttribute("aria-pressed", "true");
  await expect(saveButton).toBeDisabled();
  await expect(firstCard.getByText("Saved for later", { exact: true })).toBeVisible();

  const rejectButton = firstCard.getByRole("button", { name: "Reject" });
  await rejectButton.focus();
  await rejectButton.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Reject this idea" });
  const reason = page.getByLabel("Reason (optional)");
  await expect(dialog).toBeVisible();
  await expect(reason).toBeFocused();

  for (let index = 0; index < 3; index += 1) {
    await page.keyboard.press("Tab");
    await expect
      .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
      .toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(rejectButton).toBeFocused();

  await rejectButton.press("Space");
  await expect(reason).toBeFocused();
  await reason.fill("Keyboard decision note");
  const rejectIdeaButton = page.getByRole("button", { name: "Reject idea" });
  await rejectIdeaButton.focus();
  await rejectIdeaButton.press("Enter");
  await expect(firstCard.getByText("Rejected", { exact: true })).toBeVisible();
  await expect(rejectButton).toHaveAttribute("aria-pressed", "true");
  await expect(rejectButton).toBeEnabled();
  await rejectButton.press("Enter");
  await expect(reason).toHaveValue("Keyboard decision note");
  await page.keyboard.press("Escape");
  await expect(rejectButton).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: "Decision updated." })).toBeVisible();
});

test("keeps English UI chrome and Persian generated content distinct", async ({ page }) => {
  const email = emailFor("ideas-mixed-language").toLowerCase();

  await signUp(page, email);

  await createReadyContentDna(page);
  await seedCompletedPersianBatch(email);
  await page.goto("/en/ideas");

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.locator("body")).toHaveCSS("font-family", /Roboto/);

  const title = "چطور لباس گران همیشه شیک نیست";
  const description = "نشانه‌های بصری ارزشمند بودن لباس همیشه به قیمت آن وابسته نیستند.";
  const card = page.locator("article").filter({ hasText: title }).first();
  const titleElement = card.getByRole("heading", { name: title, exact: true });
  const descriptionElement = card.getByText(description, { exact: true });

  await expect(titleElement).toHaveAttribute("lang", "fa");
  await expect(titleElement).toHaveAttribute("dir", "rtl");
  await expect(titleElement).toHaveCSS("font-family", /Vazirmatn/);
  await expect(descriptionElement).toHaveAttribute("lang", "fa");
  await expect(descriptionElement).toHaveAttribute("dir", "rtl");
  await expect(descriptionElement).toHaveCSS("font-family", /Vazirmatn/);

  const categoryLabel = card.locator('bdi[lang="en"]');
  const categoryValue = card.locator('bdi[lang="fa"]');
  await expect(categoryLabel).toHaveText("Category:");
  await expect(categoryLabel).toHaveAttribute("dir", "ltr");
  await expect(categoryLabel).toHaveCSS("font-family", /Roboto/);
  await expect(categoryValue).toHaveText("منابع");
  await expect(categoryValue).toHaveAttribute("dir", "rtl");
  await expect(categoryValue).toHaveCSS("font-family", /Vazirmatn/);

  await expect(card.getByRole("button", { name: "Reject" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(card.getByRole("button", { name: "Reject" })).toBeEnabled();
  await expect(card.getByRole("button", { name: "Accept" })).toBeEnabled();
  await expect(card.getByRole("button", { name: "Save for later" })).toBeEnabled();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  for (const [width, height] of [
    [390, 844],
    [768, 900],
    [1280, 900],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(page.locator("body")).toHaveJSProperty(
      "scrollWidth",
      await page.locator("body").evaluate((body) => body.clientWidth),
    );
    await expect(titleElement).toBeVisible();
    await expect(card.getByRole("button", { name: "Accept" })).toBeEnabled();
  }

  const englishBatch = await seedBatch(email, { status: "COMPLETED", language: "en" });
  await page.goto(`/fa/ideas?batchId=${englishBatch.batchId}`);
  await expect(page.locator("html")).toHaveAttribute("lang", "fa");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("heading", { name: "برای محتوای بعدی‌تان شروعی قوی‌تر بسازید." }),
  ).toBeVisible();
  const englishContentCard = page
    .locator("article")
    .filter({ hasText: englishBatch.firstIdeaTitle })
    .first();
  await expect(
    englishContentCard.getByRole("heading", { name: englishBatch.firstIdeaTitle, exact: true }),
  ).toHaveAttribute("lang", "en");
  await expect(
    englishContentCard.getByRole("heading", { name: englishBatch.firstIdeaTitle, exact: true }),
  ).toHaveAttribute("dir", "ltr");
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    await page.locator("body").evaluate((body) => body.clientWidth),
  );
});

test("covers active, completed, provider rate-limit, retry, and decision transitions", async ({
  page,
}) => {
  const email = emailFor("ideas-workflow").toLowerCase();

  await signUp(page, email);
  await createReadyContentDna(page);
  const completed = await seedBatch(email, { status: "COMPLETED" });
  const providerLimited = await seedBatch(email, {
    status: "FAILED",
    errorCategory: "RATE_LIMITED",
  });

  await page.goto("/en/ideas?batchId=" + providerLimited.batchId);
  await expect(
    page.getByText(
      "This generation attempt was recorded as a failed batch because the AI service reached a service limit.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(page.getByText(/workspace limit window/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry generation" })).toBeVisible();

  await setE2eProviderScenario(page, "provider-unavailable");

  await page.getByRole("button", { name: "Retry generation" }).click();
  await expect(
    page.getByText("The provider did not return a safe result.", { exact: false }),
  ).toBeVisible();

  const pending = await seedBatch(email, { status: "PENDING" });
  await page.goto("/en/ideas?batchId=" + pending.batchId);
  await expect(page.getByText("Pending", { exact: true })).toBeVisible();
  await expect(page.getByText("No matching ideas", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Generated ideas" })).toHaveCount(0);

  const active = await seedBatch(email, { status: "RUNNING" });
  await page.goto("/en/ideas?batchId=" + active.batchId);
  await expect(page.getByText("Running", { exact: true })).toBeVisible();
  await expect(page.getByText("No matching ideas", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Generated ideas" })).toHaveCount(0);

  await page.goto("/en/ideas?batchId=" + completed.batchId);
  const list = page.getByRole("list", { name: "Generated ideas" });
  await expect(list.locator(":scope > li")).toHaveCount(20);
  const firstCard = page.locator("article").filter({ hasText: completed.firstIdeaTitle }).first();

  const acceptButton = firstCard.getByRole("button", { name: "Accept" });
  await acceptButton.click();
  await expect(acceptButton).toHaveAttribute("aria-pressed", "true");
  await expect(firstCard.getByText("Accepted", { exact: true })).toBeVisible();

  const saveButton = firstCard.getByRole("button", { name: "Save for later" });
  await saveButton.click();
  await expect(saveButton).toHaveAttribute("aria-pressed", "true");
  await expect(firstCard.getByText("Saved for later", { exact: true })).toBeVisible();

  const rejectButton = firstCard.getByRole("button", { name: "Reject" });
  await rejectButton.click();
  const dialog = page.getByRole("dialog", { name: "Reject this idea" });
  const reason = page.getByLabel("Reason (optional)");
  await expect(dialog).toBeVisible();
  await expect(reason).toBeFocused();

  for (let index = 0; index < 3; index += 1) {
    await page.keyboard.press("Tab");
    await expect
      .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
      .toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(rejectButton).toBeFocused();

  await rejectButton.click();
  await page.getByLabel("Reason (optional)").fill("Already covered");
  await page.getByRole("button", { name: "Reject idea" }).click();
  await expect(firstCard.getByText("Rejected", { exact: true })).toBeVisible();
  await expect(firstCard.getByRole("button", { name: "Reject" })).toBeEnabled();
  await expect(firstCard.getByRole("button", { name: "Reject" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("renders workspace rate-limit denial without a batch or provider request", async ({
  page,
}) => {
  const email = emailFor("ideas-workspace-limit").toLowerCase();

  await signUp(page, email);
  await createReadyContentDna(page);
  await seedBatch(email, { status: "FAILED", errorCategory: "UNKNOWN" });
  await seedBatch(email, { status: "FAILED", errorCategory: "UNKNOWN" });
  await seedBatch(email, { status: "FAILED", errorCategory: "UNKNOWN" });
  const batchCountBefore = await countBatches(email);
  let avalaiRequests = 0;

  await page.route("https://api.avalai.ir/**", async (route) => {
    avalaiRequests += 1;
    await route.abort();
  });
  await page.goto("/en/ideas");
  await page.getByRole("button", { name: "Generate 20 Ideas" }).click();
  await expect(
    page.getByText(
      "No new batch was created. Wait for the workspace limit window to pass, then try again.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(await countBatches(email)).toBe(batchCountBefore);
  expect(avalaiRequests).toBe(0);
});

test("keeps a stale generation request in the localized conflict state", async ({
  context,
  page,
}) => {
  const email = emailFor("ideas-conflict").toLowerCase();

  await signUp(page, email);
  await createReadyContentDna(page);
  await page.goto("/en/ideas");

  const editor = await context.newPage();
  await editor.goto("/en/content-dna");
  await editor
    .getByLabel("Creator or brand description")
    .fill("A newer creator identity saved in another browser tab.");
  await editor.getByRole("button", { name: "Save Content DNA" }).click();
  await expect(editor.getByText("AI-ready", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Generate 20 Ideas" }).click();
  await expect(
    page.getByText(
      "The version used by this page is no longer current. Review the latest Content DNA, then try again.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(await countBatches(email)).toBe(0);
  await editor.close();
});

test("uses one Ideas Library for cross-batch status and Past Runs intersections", async ({
  page,
}) => {
  const email = emailFor("ideas-library-cross-batch").toLowerCase();
  await signUp(page, email);
  await createReadyContentDna(page);
  const older = await seedBatch(email, { status: "COMPLETED" });
  const newer = await seedBatch(email, { status: "COMPLETED" });

  await page.goto("/en/ideas");
  await expect(page.getByRole("link", { name: "New" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "All runs" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    page.getByRole("list", { name: "Generated ideas" }).locator(":scope > li"),
  ).toHaveCount(40);

  await page.goto(`/en/ideas?batchId=${older.batchId}`);
  const oldRunCard = page.locator("article").filter({ hasText: older.firstIdeaTitle }).first();
  await oldRunCard.getByRole("button", { name: "Save for later" }).click();
  await expect(
    page.getByRole("list", { name: "Generated ideas" }).locator(":scope > li"),
  ).toHaveCount(19);

  await page.goto("/en/ideas?view=saved");
  await expect(page.locator("article").filter({ hasText: older.firstIdeaTitle })).toHaveCount(1);
  await page.goto(`/en/ideas?view=saved&batchId=${older.batchId}`);
  await expect(page.locator("article").filter({ hasText: older.firstIdeaTitle })).toHaveCount(1);

  await page.goto(`/en/ideas?batchId=${older.batchId}`);
  await page.locator("article").first().getByRole("button", { name: "Accept" }).click();
  await page.goto(`/en/ideas?view=accepted&batchId=${older.batchId}`);
  await expect(page.getByRole("button", { name: "Generate Script" })).toHaveCount(1);
  await page.goto("/en/ideas?view=accepted");
  await expect(page.getByRole("link", { name: "All runs" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await page.goto(`/en/ideas?batchId=${older.batchId}`);
  await page.locator("article").first().getByRole("button", { name: "Reject" }).click();
  const rejectionDialog = page.getByRole("dialog", { name: "Reject this idea" });
  await rejectionDialog.getByRole("button", { name: "Reject idea" }).click();
  await page.goto(`/en/ideas?view=rejected&batchId=${older.batchId}`);
  await expect(page.getByRole("article")).toBeVisible();

  await page.goto(`/en/ideas?view=all&batchId=${older.batchId}`);
  await expect(
    page.getByRole("list", { name: "Generated ideas" }).locator(":scope > li"),
  ).toHaveCount(20);
  await page.goto(`/en/ideas?view=all&batchId=${newer.batchId}`);
  await expect(
    page.getByRole("list", { name: "Generated ideas" }).locator(":scope > li"),
  ).toHaveCount(20);
});
