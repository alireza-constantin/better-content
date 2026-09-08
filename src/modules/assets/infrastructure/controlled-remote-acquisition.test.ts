import { describe, expect, it } from "vitest";

import { isProhibitedRemoteAddress } from "../domain/external-url-contracts";
import {
  createControlledRemoteAcquirer,
  type ControlledRemoteResolver,
} from "./controlled-remote-acquisition";

const publicResolver: ControlledRemoteResolver = {
  resolve: async () => [{ address: "8.8.8.8", family: 4 }],
};

function response(
  statusCode: number,
  headers: Record<string, string> = {},
  body = Buffer.from("media"),
) {
  return {
    statusCode,
    headers,
    body: (async function* () {
      yield body;
    })(),
  };
}

describe("controlled remote acquisition", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "100.64.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "::",
    "::1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
  ])("rejects prohibited destination %s", (address) => {
    expect(isProhibitedRemoteAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])(
    "allows representative public address %s",
    (address) => expect(isProhibitedRemoteAddress(address)).toBe(false),
  );

  it("pins the selected resolver answer into transport while TLS keeps the original hostname", async () => {
    const calls: { address: string; servername: string }[] = [];
    const acquirer = createControlledRemoteAcquirer({
      resolver: {
        resolve: async () => [
          { address: "8.8.8.8", family: 4 },
          { address: "10.0.0.2", family: 4 },
        ],
      },
      transport: {
        request: async (input) => {
          calls.push({ address: input.address.address, servername: input.servername });
          return response(200);
        },
      },
    });
    await expect(acquirer.acquire("https://media.example/image", "IMAGE")).rejects.toMatchObject({
      failureCode: "UNSAFE_MEDIA_URL",
    });
    expect(calls).toEqual([]);
  });

  it("revalidates a relative redirect and does not forward credentials", async () => {
    const names: string[] = [];
    const acquirer = createControlledRemoteAcquirer({
      resolver: {
        resolve: async (hostname) => {
          names.push(hostname);
          return [{ address: "8.8.8.8", family: 4 }];
        },
      },
      transport: {
        request: async (input) =>
          input.url.pathname === "/start"
            ? response(302, { location: "/media" })
            : response(200, { "content-length": "5" }, Buffer.from("media")),
      },
    });
    const chunks: Buffer[] = [];
    for await (const chunk of await acquirer.acquire("https://media.example/start", "IMAGE"))
      chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe("media");
    expect(names).toEqual(["media.example", "media.example"]);
  });

  it("rejects downgrade, fourth redirect, oversized content length, and chunked overflow", async () => {
    const redirect = createControlledRemoteAcquirer({
      resolver: publicResolver,
      transport: { request: async () => response(302, { location: "http://example.com/media" }) },
    });
    await expect(redirect.acquire("https://example.com/start", "IMAGE")).rejects.toMatchObject({
      failureCode: "UNSAFE_MEDIA_URL",
    });
    let redirects = 0;
    const tooManyRedirects = createControlledRemoteAcquirer({
      resolver: publicResolver,
      transport: {
        request: async () => {
          redirects += 1;
          return response(302, { location: `/hop-${redirects}` });
        },
      },
    });
    await expect(
      tooManyRedirects.acquire("https://example.com/start", "IMAGE"),
    ).rejects.toMatchObject({
      failureCode: "UNSAFE_MEDIA_URL",
    });
    expect(redirects).toBe(4);
    const tooLarge = createControlledRemoteAcquirer({
      resolver: publicResolver,
      transport: {
        request: async () => response(200, { "content-length": String(10 * 1024 * 1024 + 1) }),
      },
    });
    await expect(tooLarge.acquire("https://example.com/media", "IMAGE")).rejects.toMatchObject({
      failureCode: "MEDIA_TOO_LARGE",
    });
    const chunked = createControlledRemoteAcquirer({
      resolver: publicResolver,
      transport: {
        request: async () => ({
          statusCode: 200,
          headers: {},
          body: (async function* () {
            yield Buffer.alloc(10 * 1024 * 1024);
            yield Buffer.from("x");
          })(),
        }),
      },
    });
    const source = await chunked.acquire("https://example.com/media", "IMAGE");
    await expect(async () => {
      for await (const _chunk of source) void _chunk;
    }).rejects.toMatchObject({
      failureCode: "MEDIA_TOO_LARGE",
    });
  });
});
