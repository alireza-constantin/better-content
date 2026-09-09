import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { Client } from "pg";
import { expect, test, type Page } from "@playwright/test";

const execFileAsync = promisify(execFile);
const password = "A-strong-e2e-password-123!";
const storageEnvironment = {
  ASSET_STORAGE_DRIVER: "s3",
  ASSET_STORAGE_VERSIONING: "disabled",
  ASSET_S3_ENDPOINT: "http://127.0.0.1:3101",
  ASSET_S3_REGION: "e2e",
  ASSET_S3_BUCKET: "e2e-assets",
  ASSET_S3_ACCESS_KEY_ID: "e2e-access-key",
  ASSET_S3_SECRET_ACCESS_KEY: "e2e-secret-key",
  ASSET_S3_FORCE_PATH_STYLE: "true",
};
const imageBytes = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9k=",
  "base64",
);

function emailFor(testName: string): string {
  return testName + "-" + crypto.randomUUID() + "@example.test";
}

async function signUp(page: Page, email: string, locale: "en" | "fa"): Promise<void> {
  await page.goto("/" + locale + "/sign-up");
  await page.getByLabel(locale === "en" ? "Name" : "نام").fill("Asset Creator");
  await page.getByLabel(locale === "en" ? "Email address" : "نشانی ایمیل").fill(email);
  await page.getByLabel(locale === "en" ? "Password" : "رمز عبور").fill(password);
  await page
    .getByRole("button", { name: locale === "en" ? "Create account" : "ساخت حساب" })
    .click();
  await expect(page).toHaveURL(new RegExp("/" + locale + "/dashboard$"));
}

async function createContentFixture(email: string): Promise<string> {
  const client = new Client({ connectionString: process.env.E2E_DATABASE_URL });
  await client.connect();
  try {
    const owner = (
      await client.query<{ user_id: string; workspace_id: string }>(
        'SELECT u.id AS user_id, wm.workspace_id FROM "user" u INNER JOIN workspace_members wm ON wm.user_id = u.id WHERE u.email = $1',
        [email],
      )
    ).rows[0];
    if (!owner) throw new Error("The Asset E2E content owner was not found.");
    const ids = {
      contentDnaId: crypto.randomUUID(),
      contentDnaVersionId: crypto.randomUUID(),
      ideaRunId: crypto.randomUUID(),
      ideaBatchId: crypto.randomUUID(),
      ideaId: crypto.randomUUID(),
      contentId: crypto.randomUUID(),
      attemptId: crypto.randomUUID(),
      contentRunId: crypto.randomUUID(),
    };
    const document = { schemaVersion: 1, script: { text: "" } };
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO content_dna (id, workspace_id, current_version_id) VALUES ($1, $2, $3)",
      [ids.contentDnaId, owner.workspace_id, ids.contentDnaVersionId],
    );
    await client.query(
      "INSERT INTO content_dna_versions (id, content_dna_id, version_number, payload, created_by_user_id) VALUES ($1, $2, 1, $3::jsonb, $4)",
      [
        ids.contentDnaVersionId,
        ids.contentDnaId,
        JSON.stringify({
          schemaVersion: 1,
          identity: {},
          language: { defaultContentLanguage: "en", contentLanguages: ["en"] },
        }),
        owner.user_id,
      ],
    );
    await client.query(
      "INSERT INTO ai_runs (id, workspace_id, kind, provider, model, prompt_version, generation_settings, status, output_snapshot, usage, started_at, completed_at) VALUES ($1, $2, 'IDEA_GENERATION', 'avalai', 'gpt-5.6-luna', 'idea-generation/v1', '{}'::jsonb, 'COMPLETED', '{\"schemaVersion\":1,\"ideas\":[]}'::jsonb, '{\"inputTokens\":1,\"outputTokens\":1,\"totalTokens\":2}'::jsonb, NOW(), NOW())",
      [ids.ideaRunId, owner.workspace_id],
    );
    await client.query(
      "INSERT INTO idea_generation_batches (id, workspace_id, content_dna_version_id, ai_run_id, idempotency_key, request_fingerprint, requested_language, requested_count, status, started_at, completed_at) VALUES ($1, $2, $3, $4, $5, $6, 'en', 20, 'COMPLETED', NOW(), NOW())",
      [
        ids.ideaBatchId,
        owner.workspace_id,
        ids.contentDnaVersionId,
        ids.ideaRunId,
        crypto.randomUUID(),
        "a".repeat(64),
      ],
    );
    await client.query(
      "INSERT INTO ideas (id, batch_id, position, title, description, category, language, status) VALUES ($1, $2, 1, 'Asset E2E idea', 'Asset E2E fixture', 'E2E', 'en', 'ACCEPTED')",
      [ids.ideaId, ids.ideaBatchId],
    );
    await client.query(
      "INSERT INTO ai_runs (id, workspace_id, kind, provider, model, prompt_version, generation_settings, status, output_snapshot, usage, started_at, completed_at) VALUES ($1, $2, 'CONTENT_SCRIPT_GENERATION', 'avalai', 'gpt-5.6-luna', 'content-script-generation/v1', '{}'::jsonb, 'COMPLETED', $3::jsonb, '{\"inputTokens\":1,\"outputTokens\":1,\"totalTokens\":2}'::jsonb, NOW(), NOW())",
      [ids.contentRunId, owner.workspace_id, JSON.stringify(document)],
    );
    await client.query(
      "INSERT INTO content_generation_attempts (id, workspace_id, source_idea_id, content_dna_version_id, requested_language, format, instructions, idempotency_key, request_fingerprint, ai_run_id, status, started_at, completed_at) VALUES ($1, $2, $3, $4, 'en', 'SHORT_VIDEO', NULL, $5, $6, $7, 'COMPLETED', NOW(), NOW())",
      [
        ids.attemptId,
        owner.workspace_id,
        ids.ideaId,
        ids.contentDnaVersionId,
        crypto.randomUUID(),
        "b".repeat(64),
        ids.contentRunId,
      ],
    );
    await client.query(
      "INSERT INTO contents (id, workspace_id, source_idea_id, content_language, format, source_generation_attempt_id) VALUES ($1, $2, $3, 'en', 'SHORT_VIDEO', $4)",
      [ids.contentId, owner.workspace_id, ids.ideaId, ids.attemptId],
    );
    await client.query(
      "INSERT INTO content_versions (content_id, version_number, document, source, ai_run_id, created_by_user_id) VALUES ($1, 1, $2::jsonb, 'AI_GENERATED', $3, $4)",
      [ids.contentId, JSON.stringify(document), ids.contentRunId, owner.user_id],
    );
    await client.query(
      "INSERT INTO content_drafts (content_id, document, revision) VALUES ($1, $2::jsonb, 1)",
      [ids.contentId, JSON.stringify(document)],
    );
    await client.query("COMMIT");
    return ids.contentId;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function runDeterministicAssetWorker(): Promise<void> {
  await execFileAsync(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", "e2e/asset-worker.ts"],
    {
      env: {
        ...process.env,
        ...storageEnvironment,
        DATABASE_URL: process.env.E2E_DATABASE_URL,
        BETTER_AUTH_SECRET: "e2e-only-better-auth-secret-that-is-long-enough",
        BETTER_AUTH_URL: "http://127.0.0.1:3100",
      },
      cwd: process.cwd(),
    },
  );
}

async function createUpload(page: Page, displayName: string): Promise<void> {
  await page.getByLabel("Display name").first().fill(displayName);
  await page.getByLabel("Media file").setInputFiles({
    name: "cover.jpg",
    mimeType: "image/jpeg",
    buffer: imageBytes,
  });
  await page.getByRole("button", { name: "Upload media" }).click();
  await expect(page.getByRole("status")).toContainText("processing");
}

test("EN/LTR persists upload, READY selection, autosave, acceptance, and history", async ({
  page,
}) => {
  const email = emailFor("assets-en").toLowerCase();
  await signUp(page, email, "en");
  const contentId = await createContentFixture(email);
  await page.goto("/en/assets");
  await createUpload(page, "B-roll cover");
  await runDeterministicAssetWorker();
  await page.reload();
  await expect(page.getByText("B-roll cover", { exact: true })).toBeVisible();
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();

  await page.goto("/en/content/" + contentId);
  const edit = page.locator('section[aria-label="Edit"]');
  await edit.getByRole("button", { name: "Add" }).click();
  const directionDialog = page.getByRole("dialog");
  await directionDialog.getByLabel("Direction type").selectOption("BROLL_CUE");
  await directionDialog.getByLabel("Description").fill("Cover the opening");
  await directionDialog.getByRole("button", { name: "Add" }).click();
  await edit.getByRole("button", { name: "Select media" }).click();
  const picker = page.getByRole("dialog", { name: "Select media" });
  await picker.getByRole("button").filter({ hasText: "B-roll cover" }).click();
  await picker.getByRole("button", { name: "Use media" }).click();
  await expect(page.getByText(/Revision [23]/)).toBeVisible({ timeout: 8_000 });
  await page.getByRole("button", { name: "Accept Draft" }).click();
  await expect(page.getByText("Accepted", { exact: true })).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: "Open Version History" }).click();
  await expect(page.getByRole("dialog")).toContainText("Media attached");
});

test("FA/RTL manages mixed-direction media names and safely deletes after confirmation", async ({
  page,
}) => {
  const email = emailFor("assets-fa").toLowerCase();
  await signUp(page, email, "fa");
  await page.goto("/fa/assets");
  await expect(page.locator("html")).toHaveAttribute("lang", "fa");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await createUpload(page, "کاور English 42");
  await runDeterministicAssetWorker();
  await page.reload();
  await expect(page.getByText("کاور English 42", { exact: true })).toBeVisible();
  await expect(page.getByText("آماده", { exact: true })).toBeVisible();
  await page.getByRole("button").filter({ hasText: "کاور English 42" }).first().click();
  const detail = page.getByRole("dialog");
  await expect(detail.getByRole("img", { name: "کاور English 42" })).toBeVisible();
  await detail.getByRole("button", { name: "حذف رسانه" }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "حذف همیشگی" }).click();
  await expect(page.getByText("در حال حذف", { exact: true })).toBeVisible();
  await runDeterministicAssetWorker();
  await page.reload();
  await expect(page.getByText("کاور English 42", { exact: true })).toHaveCount(0);
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    await page.locator("body").evaluate((body) => body.clientWidth),
  );
});
