import { readFile, writeFile } from "node:fs/promises";

const nextEnvironmentFile = "next-env.d.ts";
const typeScriptConfigFile = "tsconfig.json";

/**
 * Next.js writes type references for the active build directory. Restore the
 * normal development references after the temporary E2E build shuts down.
 */
export default async function restoreDevelopmentTypeReferences(): Promise<void> {
  const nextEnvironment = await readFile(nextEnvironmentFile, "utf8");
  const restoredNextEnvironment = nextEnvironment
    .replaceAll("./.next-e2e/dev/types/routes.d.ts", "./.next/types/routes.d.ts")
    .replaceAll("./.next-e2e/dev/types/root-params.d.ts", "./.next/types/root-params.d.ts")
    .replaceAll("./.next-e2e/types/routes.d.ts", "./.next/types/routes.d.ts")
    .replaceAll("./.next-e2e/types/root-params.d.ts", "./.next/types/root-params.d.ts");

  if (restoredNextEnvironment !== nextEnvironment) {
    await writeFile(nextEnvironmentFile, restoredNextEnvironment);
  }

  const typeScriptConfig = await readFile(typeScriptConfigFile, "utf8");
  const restoredTypeScriptConfig = typeScriptConfig
    .replace(',\n    ".next-e2e/types/**/*.ts"', "")
    .replace(',\n    ".next-e2e/dev/types/**/*.ts"', "");

  if (restoredTypeScriptConfig !== typeScriptConfig) {
    await writeFile(typeScriptConfigFile, restoredTypeScriptConfig);
  }
}
