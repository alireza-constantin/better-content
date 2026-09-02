import "server-only";

import {
  parseOpenAIEnvironment,
  parseServerEnvironment,
  type OpenAIEnvironment,
  type ServerEnvironment,
} from "./schema";

export {
  parseOpenAIEnvironment,
  parseServerEnvironment,
  type OpenAIEnvironment,
  type ServerEnvironment,
};

export function getServerEnvironment(): ServerEnvironment {
  return parseServerEnvironment(process.env);
}

export function getOpenAIEnvironment(): OpenAIEnvironment {
  return parseOpenAIEnvironment(process.env);
}
