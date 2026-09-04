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
