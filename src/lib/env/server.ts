import "server-only";

import {
  parseAvalAIEnvironment,
  parseServerEnvironment,
  type AvalAIEnvironment,
  type ServerEnvironment,
} from "./schema";

export {
  parseAvalAIEnvironment,
  parseServerEnvironment,
  type AvalAIEnvironment,
  type ServerEnvironment,
};

export function getServerEnvironment(): ServerEnvironment {
  return parseServerEnvironment(process.env);
}

export function getAvalAIEnvironment(): AvalAIEnvironment {
  return parseAvalAIEnvironment(process.env);
}
