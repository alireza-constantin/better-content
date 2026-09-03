import { readE2eProviderTelemetry } from "@/modules/ai/testing/e2e-provider-telemetry";

export function GET(): Response {
  if (process.env.BETTER_CONTENT_E2E !== "1") {
    return new Response(null, { status: 404 });
  }

  return Response.json(readE2eProviderTelemetry(), {
    headers: { "cache-control": "no-store" },
  });
}
