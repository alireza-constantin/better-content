import "server-only";

import { parseServerEnvironment, type ServerEnvironment } from "./schema";

export { parseServerEnvironment, type ServerEnvironment };

export function getServerEnvironment(): ServerEnvironment {
  return parseServerEnvironment(process.env);
}
