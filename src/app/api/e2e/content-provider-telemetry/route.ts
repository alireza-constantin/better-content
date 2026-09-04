import { readE2eContentProviderTelemetry } from "@/modules/ai/testing/e2e-content-provider-telemetry";

export function GET(): Response {
  if (process.env.BETTER_CONTENT_E2E !== "1") {
    return new Response(null, { status: 404 });
  }

  return Response.json(readE2eContentProviderTelemetry(), {
    headers: { "cache-control": "no-store" },
  });
}
