import type { AssetLibraryDto } from "../application/asset-library-service";

const mediaTypes = ["IMAGE", "VIDEO", "AUDIO"] as const;
const statuses = ["PENDING", "PROCESSING", "READY", "FAILED", "DELETING"] as const;

export type AssetLibraryUrlState = Readonly<{
  page: number;
  search: string;
  mediaType: AssetLibraryDto["mediaType"];
  status: AssetLibraryDto["status"];
}>;

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function parseAssetLibraryUrlState(
  input: Readonly<{
    page?: string | string[];
    q?: string | string[];
    type?: string | string[];
    status?: string | string[];
  }>,
): AssetLibraryUrlState {
  const rawPage = Number(single(input.page));
  return {
    page: Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 100 ? rawPage : 1,
    search: (single(input.q) ?? "").trim().slice(0, 400),
    mediaType: mediaTypes.find((value) => value === single(input.type)) ?? null,
    status: statuses.find((value) => value === single(input.status)) ?? null,
  };
}

export function assetLibraryHref(state: AssetLibraryUrlState): string {
  const params = new URLSearchParams();
  if (state.page > 1) params.set("page", String(state.page));
  if (state.search) params.set("q", state.search);
  if (state.mediaType) params.set("type", state.mediaType);
  if (state.status) params.set("status", state.status);
  const query = params.toString();
  return query ? `/assets?${query}` : "/assets";
}
