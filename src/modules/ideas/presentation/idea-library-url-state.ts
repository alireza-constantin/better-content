import type { IdeaLibraryStatusFilter } from "@/modules/ideas/application";

export const ideaLibraryViews = ["all", "new", "saved", "accepted", "rejected"] as const;

export type IdeaLibraryView = (typeof ideaLibraryViews)[number];

const statusByView: Record<IdeaLibraryView, IdeaLibraryStatusFilter> = {
  all: "ALL",
  new: "NEW",
  saved: "SAVED",
  accepted: "ACCEPTED",
  rejected: "REJECTED",
};

const viewByStatus: Record<IdeaLibraryStatusFilter, IdeaLibraryView> = {
  ALL: "all",
  NEW: "new",
  SAVED: "saved",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
};

export function parseIdeaLibraryUrlState(
  input: Readonly<{ view?: string | string[]; batchId?: string | string[] }>,
): Readonly<{
  view: IdeaLibraryView;
  statusFilter: IdeaLibraryStatusFilter;
  batchId: string | null;
}> {
  const requestedView = typeof input.view === "string" ? input.view : null;
  const view = ideaLibraryViews.find((candidate) => candidate === requestedView) ?? "new";

  return {
    view,
    statusFilter: statusByView[view],
    batchId: typeof input.batchId === "string" ? input.batchId : null,
  };
}

export function ideaLibraryHref(
  input: Readonly<{ statusFilter: IdeaLibraryStatusFilter; batchId: string | null }>,
): string {
  const params = new URLSearchParams();
  const view = viewByStatus[input.statusFilter];

  if (view !== "new") {
    params.set("view", view);
  }

  if (input.batchId) {
    params.set("batchId", input.batchId);
  }

  const query = params.toString();

  return query ? `/ideas?${query}` : "/ideas";
}
