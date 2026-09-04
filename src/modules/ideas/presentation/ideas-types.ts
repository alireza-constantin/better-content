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

export function toIdeasDnaSummary(
  current: Readonly<{
    status: IdeasDnaSummary["status"];
    currentVersion: Readonly<{
      id: string;
      versionNumber: number;
      payload: Readonly<{
        language?: Readonly<{
          defaultContentLanguage?: string;
          contentLanguages?: readonly string[];
        }>;
      }>;
    }> | null;
  }>,
): IdeasDnaSummary {
  if (current.status === "NOT_CREATED" || !current.currentVersion) {
    return { status: "NOT_CREATED", currentVersion: null };
  }

  const language = current.currentVersion.payload.language;
  const contentLanguages = (language?.contentLanguages ?? []).filter(
    (value): value is IdeasLanguage => value === "en" || value === "fa",
  );
  const defaultContentLanguage =
    (language?.defaultContentLanguage === "en" || language?.defaultContentLanguage === "fa") &&
    contentLanguages.includes(language.defaultContentLanguage)
      ? language.defaultContentLanguage
      : null;

  return {
    status: current.status,
    currentVersion: {
      id: current.currentVersion.id,
      versionNumber: current.currentVersion.versionNumber,
      defaultContentLanguage,
      contentLanguages,
    },
  };
}
