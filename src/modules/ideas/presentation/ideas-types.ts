import type { IdeaContentGenerationHistoryDto } from "@/modules/content/application/content-read-service";

export type IdeasLanguage = "en" | "fa";

export type IdeasDnaSummary = Readonly<{
  status: "NOT_CREATED" | "INCOMPLETE" | "AI_READY";
  currentVersion: Readonly<{
    id: string;
    versionNumber: number;
    defaultContentLanguage: IdeasLanguage | null;
    contentLanguages: readonly IdeasLanguage[];
  }> | null;
}>;

/** Authorized Content Attempt history keyed by the accepted Idea it came from. */
export type IdeasContentGenerationHistory = Readonly<
  Record<string, IdeaContentGenerationHistoryDto>
>;
