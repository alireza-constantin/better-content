import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { connect } from "node:tls";

import { assetByteLimits } from "../domain/upload-contracts";
import {
  isProhibitedRemoteAddress,
  normalizeExternalMediaUrl,
  normalizeHostname,
} from "../domain/external-url-contracts";
import type { AssetMediaType } from "../domain/asset-contracts";

export const remoteAcquisitionLimits = {
  maxRedirects: 3,
  dnsTimeoutMs: 5_000,
  connectTimeoutMs: 10_000,
  responseTimeoutMs: 15_000,
  idleTimeoutMs: 30_000,
  totalTimeoutMs: 5 * 60_000,
  maxHeaderBytes: 16 * 1024,
} as const;

export type RemoteAddress = Readonly<{ address: string; family: 4 | 6 }>;
export type RemoteResponse = Readonly<{
  statusCode: number;
  headers: Readonly<Record<string, string | string[] | undefined>>;
  body: AsyncIterable<Uint8Array>;
}>;
export interface ControlledRemoteResolver {
  resolve(hostname: string): Promise<readonly RemoteAddress[]>;
}
export interface ControlledRemoteTransport {
  request(
    input: Readonly<{
      url: URL;
      address: RemoteAddress;
      servername: string;
      limits: typeof remoteAcquisitionLimits;
    }>,
  ): Promise<RemoteResponse>;
}

export class RemoteAcquisitionError extends Error {
  constructor(
    readonly failureCode:
      "UNSAFE_MEDIA_URL" | "MEDIA_SOURCE_UNAVAILABLE" | "MEDIA_TOO_LARGE" | "UNSUPPORTED_MEDIA",
    readonly retryable: boolean,
  ) {
    super(failureCode);
    this.name = "RemoteAcquisitionError";
  }
}

export class NodeControlledRemoteResolver implements ControlledRemoteResolver {
  async resolve(hostname: string): Promise<readonly RemoteAddress[]> {
    const answers = await lookup(hostname, { all: true, verbatim: true });
    return answers.map((answer) => ({ address: answer.address, family: answer.family as 4 | 6 }));
  }
}

/** The TLS socket connects to the approved address while SNI verifies the original hostname. */
export class NodeControlledRemoteTransport implements ControlledRemoteTransport {
  async request(
    input: Readonly<{
      url: URL;
      address: RemoteAddress;
      servername: string;
      limits: typeof remoteAcquisitionLimits;
    }>,
  ): Promise<RemoteResponse> {
    return new Promise((resolve, reject) => {
      const requestTimeout = setTimeout(
        () => req.destroy(new Error("TOTAL_TIMEOUT")),
        input.limits.totalTimeoutMs,
      );
      const req = request(
        {
          protocol: "https:",
          hostname: input.servername,
          port: 443,
          path: `${input.url.pathname}${input.url.search}`,
          method: "GET",
          headers: { Accept: "image/*,video/*,audio/*" },
          maxHeaderSize: input.limits.maxHeaderBytes,
          agent: false,
          createConnection: () =>
            connect({
              host: input.address.address,
              port: 443,
              servername: input.servername,
              rejectUnauthorized: true,
              timeout: input.limits.connectTimeoutMs,
            }),
        },
        (response) => {
          clearTimeout(requestTimeout);
          response.setTimeout(input.limits.idleTimeoutMs, () =>
            response.destroy(new Error("IDLE_TIMEOUT")),
          );
          resolve({
            statusCode: response.statusCode ?? 0,
            headers: response.headers,
            body: response,
          });
        },
      );
      req.setTimeout(input.limits.responseTimeoutMs, () =>
        req.destroy(new Error("RESPONSE_TIMEOUT")),
      );
      req.once("error", (error) => {
        clearTimeout(requestTimeout);
        reject(error);
      });
      req.end();
    });
  }
}

export function createControlledRemoteAcquirer(
  dependencies: Readonly<{
    resolver?: ControlledRemoteResolver;
    transport?: ControlledRemoteTransport;
    limits?: typeof remoteAcquisitionLimits;
  }> = {},
): Readonly<{
  acquire(sourceUrl: string, mediaType: AssetMediaType): Promise<AsyncIterable<Uint8Array>>;
}> {
  const resolver = dependencies.resolver ?? new NodeControlledRemoteResolver();
  const transport = dependencies.transport ?? new NodeControlledRemoteTransport();
  const limits = dependencies.limits ?? remoteAcquisitionLimits;
  return {
    async acquire(sourceUrl, mediaType) {
      let current = new URL(normalizeExternalMediaUrl(sourceUrl).sourceUrl);
      const visited = new Set<string>();
      const deadline = Date.now() + limits.totalTimeoutMs;
      for (let redirects = 0; ; redirects += 1) {
        if (Date.now() >= deadline)
          throw new RemoteAcquisitionError("MEDIA_SOURCE_UNAVAILABLE", true);
        if (visited.has(current.toString()) || redirects > limits.maxRedirects)
          throw new RemoteAcquisitionError("UNSAFE_MEDIA_URL", false);
        visited.add(current.toString());
        let normalized;
        try {
          normalized = normalizeExternalMediaUrl(current.toString());
        } catch {
          throw new RemoteAcquisitionError("UNSAFE_MEDIA_URL", false);
        }
        const answers = await withTimeout(
          resolver.resolve(normalized.sourceHost),
          Math.min(limits.dnsTimeoutMs, Math.max(1, deadline - Date.now())),
        ).catch(() => {
          throw new RemoteAcquisitionError("MEDIA_SOURCE_UNAVAILABLE", true);
        });
        if (!answers.length || answers.some((answer) => isProhibitedRemoteAddress(answer.address)))
          throw new RemoteAcquisitionError("UNSAFE_MEDIA_URL", false);
        let response: RemoteResponse;
        try {
          response = await withTimeout(
            transport.request({
              url: current,
              address: answers[0],
              servername: normalizeHostname(current.hostname),
              limits,
            }),
            Math.max(1, deadline - Date.now()),
          );
        } catch {
          throw new RemoteAcquisitionError("MEDIA_SOURCE_UNAVAILABLE", true);
        }
        if (response.statusCode >= 300 && response.statusCode < 400) {
          const location = headerValue(response.headers.location);
          if (!location) throw new RemoteAcquisitionError("UNSAFE_MEDIA_URL", false);
          try {
            current = new URL(location, current);
          } catch {
            throw new RemoteAcquisitionError("UNSAFE_MEDIA_URL", false);
          }
          continue;
        }
        if (response.statusCode >= 500)
          throw new RemoteAcquisitionError("MEDIA_SOURCE_UNAVAILABLE", true);
        if (response.statusCode < 200 || response.statusCode >= 300)
          throw new RemoteAcquisitionError("MEDIA_SOURCE_UNAVAILABLE", false);
        const contentLength = Number(headerValue(response.headers["content-length"]));
        if (Number.isSafeInteger(contentLength) && contentLength > assetByteLimits[mediaType])
          throw new RemoteAcquisitionError("MEDIA_TOO_LARGE", false);
        const contentType = headerValue(response.headers["content-type"]);
        if (contentType && /^(text\/html|text\/plain|application\/json)/i.test(contentType))
          throw new RemoteAcquisitionError("UNSUPPORTED_MEDIA", false);
        return enforceByteLimit(response.body, assetByteLimits[mediaType], deadline);
      }
    },
  };
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function* enforceByteLimit(
  source: AsyncIterable<Uint8Array>,
  maximum: number,
  deadline: number,
): AsyncIterable<Uint8Array> {
  let seen = 0;
  const iterator = source[Symbol.asyncIterator]();
  try {
    for (;;) {
      const next = await withTimeout(iterator.next(), Math.max(1, deadline - Date.now()));
      if (next.done) break;
      const chunk = next.value;
      seen += chunk.byteLength;
      if (seen > maximum) throw new RemoteAcquisitionError("MEDIA_TOO_LARGE", false);
      yield chunk;
    }
  } catch (error) {
    if (Date.now() >= deadline) {
      destroyStream(source);
      throw new RemoteAcquisitionError("MEDIA_SOURCE_UNAVAILABLE", true);
    }
    if (error instanceof RemoteAcquisitionError) throw error;
    throw new RemoteAcquisitionError("MEDIA_SOURCE_UNAVAILABLE", true);
  }
  if (!seen) throw new RemoteAcquisitionError("UNSUPPORTED_MEDIA", false);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("REMOTE_TIMEOUT")), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function destroyStream(source: AsyncIterable<Uint8Array>): void {
  if ("destroy" in source && typeof source.destroy === "function") source.destroy();
}
