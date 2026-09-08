import { isIP } from "node:net";

import { z } from "zod";

import { assetMediaTypeSchema } from "./asset-contracts";
import { isSafeCreatorText, codePointLength } from "./upload-contracts";

const maximumNormalizedUrlBytes = 4_096;

export const externalMediaUrlInputSchema = z
  .object({
    workspaceId: z.uuid(),
    mediaType: assetMediaTypeSchema,
    displayName: z.string(),
    sourceUrl: z.string(),
  })
  .strict();

export type ExternalMediaUrlInput = z.infer<typeof externalMediaUrlInputSchema>;

export type NormalizedExternalMediaUrl = Readonly<{ sourceUrl: string; sourceHost: string }>;

export function normalizeExternalMediaUrl(input: string): NormalizedExternalMediaUrl {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("INVALID_EXTERNAL_MEDIA_URL");
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error("INVALID_EXTERNAL_MEDIA_URL");
  url.hash = "";
  const sourceUrl = url.toString();
  if (Buffer.byteLength(sourceUrl, "utf8") > maximumNormalizedUrlBytes)
    throw new Error("INVALID_EXTERNAL_MEDIA_URL");
  return { sourceUrl, sourceHost: normalizeHostname(url.hostname) };
}

export function normalizeExternalMediaUrlInput(
  input: unknown,
): ExternalMediaUrlInput & NormalizedExternalMediaUrl {
  const parsed = externalMediaUrlInputSchema.safeParse(input);
  if (!parsed.success) throw new Error("INVALID_EXTERNAL_MEDIA_URL");
  const displayName = parsed.data.displayName.trim();
  if (!isSafeCreatorText(displayName) || codePointLength(displayName) > 200)
    throw new Error("INVALID_EXTERNAL_MEDIA_URL");
  return { ...parsed.data, displayName, ...normalizeExternalMediaUrl(parsed.data.sourceUrl) };
}

/** URL gives an ASCII/punycode hostname; this strips IPv6 brackets defensively. */
export function normalizeHostname(hostname: string): string {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!normalized || normalized.includes("/", 1) || normalized.includes("@"))
    throw new Error("INVALID_EXTERNAL_MEDIA_URL");
  return normalized;
}

export function isProhibitedRemoteAddress(address: string): boolean {
  const normalized = normalizeHostname(address);
  const version = isIP(normalized);
  if (version === 4) return isProhibitedIpv4(normalized);
  if (version !== 6) return true;
  const groups = parseIpv6(normalized);
  if (!groups) return true;
  const mapped = ipv4MappedIpv6(groups);
  if (mapped) return isProhibitedIpv4(mapped);
  return (
    groups.every((group) => group === 0) ||
    (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) ||
    (groups[0] & 0xfe00) === 0xfc00 ||
    (groups[0] & 0xffc0) === 0xfe80 ||
    (groups[0] & 0xff00) === 0xff00 ||
    (groups[0] === 0x2001 && groups[1] === 0x0db8) ||
    (groups[0] === 0x2001 && groups[1] === 0x0002 && groups[2] === 0) ||
    (groups[0] === 0x2001 && (groups[1] & 0xfff0) === 0x0010)
  );
}

function isProhibitedIpv4(address: string): boolean {
  const [a, b, c] = address.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function parseIpv6(address: string): number[] | null {
  const [head, tail = ""] = address.split("::");
  if (address.split("::").length > 2) return null;
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const expand = (parts: string[]) =>
    parts.flatMap((part) => {
      if (!part.includes(".")) return [part];
      if (isIP(part) !== 4) return ["invalid"];
      const numbers = part.split(".").map(Number);
      return [
        ((numbers[0] << 8) | numbers[1]).toString(16),
        ((numbers[2] << 8) | numbers[3]).toString(16),
      ];
    });
  const left = expand(headParts);
  const right = expand(tailParts);
  const groups = address.includes("::")
    ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right]
    : left;
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) return null;
  return groups.map((group) => parseInt(group, 16));
}

function ipv4MappedIpv6(groups: readonly number[]): string | undefined {
  if (!groups.slice(0, 5).every((group) => group === 0) || groups[5] !== 0xffff) return undefined;
  return [groups[6] >>> 8, groups[6] & 255, groups[7] >>> 8, groups[7] & 255].join(".");
}
