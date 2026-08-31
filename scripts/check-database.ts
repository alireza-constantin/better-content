import { checkDatabaseReadiness } from "../src/lib/dev-database-check";

async function main(): Promise<void> {
  const result = await checkDatabaseReadiness();

  if (!result.ok) {
    console.error("Database check failed: " + result.message);
    process.exitCode = 1;
    return;
  }

  console.info(result.message);
}

main().catch(() => {
  console.error("Database check failed: could not inspect the local PostgreSQL database.");
  process.exitCode = 1;
});
