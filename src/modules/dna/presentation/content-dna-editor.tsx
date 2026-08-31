"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  loadCurrentContentDnaAction,
  saveContentDnaAction,
} from "@/modules/dna/application/save-content-dna-action";
import type { ContentDnaPayload } from "@/modules/dna/domain/content-dna-payload";
import type { CurrentContentDnaDto } from "@/modules/dna/application";

type EditorValues = {
  creatorOrBrandDescription: string;
  targetAudienceDescription: string;
  primaryTopics: string[];
  toneTraits: string[];
  preferredStyle: string;
  contentGoals: string[];
  preferredFormats: string[];
  topicsToAvoid: string[];
  approachesToAvoid: string[];
  additionalInstructions: string;
  defaultContentLanguage: "" | "en" | "fa";
  contentLanguages: ("en" | "fa")[];
};

const emptyValues: EditorValues = {
  creatorOrBrandDescription: "",
  targetAudienceDescription: "",
  primaryTopics: [],
  toneTraits: [],
  preferredStyle: "",
  contentGoals: [],
  preferredFormats: [],
  topicsToAvoid: [],
  approachesToAvoid: [],
  additionalInstructions: "",
  defaultContentLanguage: "",
  contentLanguages: [],
};
const priorityFields = new Set<keyof EditorValues>(["primaryTopics", "toneTraits", "contentGoals"]);

function valuesFromPayload(payload?: ContentDnaPayload): EditorValues {
  if (!payload) return emptyValues;
  return {
    creatorOrBrandDescription: payload.identity?.creatorOrBrandDescription ?? "",
    targetAudienceDescription: payload.audience?.targetAudienceDescription ?? "",
    primaryTopics: [...(payload.expertise?.primaryTopics ?? [])],
    toneTraits: [...(payload.voice?.toneTraits ?? [])],
    preferredStyle: payload.voice?.preferredStyle ?? "",
    contentGoals: [...(payload.goals?.contentGoals ?? [])],
    preferredFormats: [...(payload.preferences?.preferredFormats ?? [])],
    topicsToAvoid: [...(payload.preferences?.topicsToAvoid ?? [])],
    approachesToAvoid: [...(payload.preferences?.approachesToAvoid ?? [])],
    additionalInstructions: payload.preferences?.additionalInstructions ?? "",
    defaultContentLanguage: payload.language?.defaultContentLanguage ?? "",
    contentLanguages: [...(payload.language?.contentLanguages ?? [])],
  };
}

function payloadFromValues(v: EditorValues): unknown {
  return {
    schemaVersion: 1,
    identity: { creatorOrBrandDescription: v.creatorOrBrandDescription },
    audience: { targetAudienceDescription: v.targetAudienceDescription },
    expertise: { primaryTopics: v.primaryTopics },
    voice: { toneTraits: v.toneTraits, preferredStyle: v.preferredStyle },
    goals: { contentGoals: v.contentGoals },
    preferences: {
      preferredFormats: v.preferredFormats,
      topicsToAvoid: v.topicsToAvoid,
      approachesToAvoid: v.approachesToAvoid,
      additionalInstructions: v.additionalInstructions,
    },
    language: {
      defaultContentLanguage: v.defaultContentLanguage,
      contentLanguages: v.contentLanguages,
    },
  };
}

export function ContentDnaEditor({
  initialContentDna,
  workspaceId,
}: Readonly<{ initialContentDna: CurrentContentDnaDto; workspaceId: string }>) {
  const t = useTranslations("ContentDna");
  const initialValues = useMemo(
    () => valuesFromPayload(initialContentDna.currentVersion?.payload),
    [initialContentDna],
  );
  const [values, setValues] = useState(initialValues);
  const [baseVersionId, setBaseVersionId] = useState(initialContentDna.currentVersion?.id ?? null);
  const [readiness, setReadiness] = useState(initialContentDna.status);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<"CONFLICT" | "VALIDATION_ERROR" | "GENERIC" | null>(null);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const update = <K extends keyof EditorValues>(key: K, value: EditorValues[K]) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    setDirty(true);
    setError(null);
  };
  const updateList = (key: keyof EditorValues, index: number, value: string) =>
    update(
      key,
      (values[key] as string[]).map((item, itemIndex) =>
        itemIndex === index ? value : item,
      ) as EditorValues[typeof key],
    );
  const addList = (key: keyof EditorValues) =>
    update(key, [...(values[key] as string[]), ""] as EditorValues[typeof key]);
  const removeList = (key: keyof EditorValues, index: number) =>
    update(
      key,
      (values[key] as string[]).filter(
        (_, itemIndex) => itemIndex !== index,
      ) as EditorValues[typeof key],
    );
  const moveList = (key: keyof EditorValues, index: number, offset: -1 | 1) => {
    const next = [...(values[key] as string[])];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    update(key, next as EditorValues[typeof key]);
  };
  const reloadLatest = async () => {
    const result = await loadCurrentContentDnaAction(workspaceId);
    if (!result.ok) {
      setError("GENERIC");
      return;
    }
    const current = result.current;
    const next = valuesFromPayload(current.currentVersion?.payload);
    setValues(next);
    setBaseVersionId(current.currentVersion?.id ?? null);
    setReadiness(current.status);
    setDirty(false);
    setError(null);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const result = await saveContentDnaAction({
      workspaceId,
      baseVersionId,
      payload: payloadFromValues(values),
    });
    setSaving(false);
    if (!result.ok) {
      setError(
        result.code === "CONFLICT" || result.code === "VALIDATION_ERROR" ? result.code : "GENERIC",
      );
      return;
    }
    setBaseVersionId(result.version.id);
    setReadiness(result.version.readiness);
    setValues(valuesFromPayload(result.version.payload));
    setDirty(false);
  };
  const list = (key: keyof EditorValues, label: string) => (
    <fieldset className="mt-5">
      <legend className="text-sm font-medium">{label}</legend>
      {(values[key] as string[]).map((value, index, array) => (
        <div className="mt-2 flex gap-2" key={`${key}-${index}`}>
          <input
            aria-label={`${label} ${index + 1}`}
            className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2"
            value={value}
            onChange={(event) => updateList(key, index, event.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => removeList(key, index)}
            aria-label={t("remove", { value: value || String(index + 1) })}
          >
            {t("remove", { value: value || String(index + 1) })}
          </Button>
          {priorityFields.has(key) && (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={index === 0}
                onClick={() => moveList(key, index, -1)}
                aria-label={t("moveUp", { value: value || String(index + 1) })}
              >
                ↑
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={index === array.length - 1}
                onClick={() => moveList(key, index, 1)}
                aria-label={t("moveDown", { value: value || String(index + 1) })}
              >
                ↓
              </Button>
            </>
          )}
        </div>
      ))}
      <Button className="mt-2" type="button" variant="outline" onClick={() => addList(key)}>
        {t("add")}
      </Button>
    </fieldset>
  );
  const text = (
    key:
      | "creatorOrBrandDescription"
      | "targetAudienceDescription"
      | "preferredStyle"
      | "additionalInstructions",
    label: string,
  ) => (
    <label className="mt-5 block text-sm font-medium">
      {label}
      <textarea
        className="mt-2 block min-h-24 w-full rounded-md border bg-background px-3 py-2 font-normal"
        value={values[key]}
        onChange={(event) => update(key, event.target.value)}
      />
    </label>
  );
  const isEmpty = initialContentDna.status === "NOT_CREATED" && !baseVersionId;

  return (
    <form className="mt-10 space-y-8" onSubmit={submit}>
      {isEmpty && (
        <div className="rounded-lg border border-dashed p-5">
          <h2 className="text-xl font-semibold">{t("emptyTitle")}</h2>
          <p className="mt-2 text-muted-foreground">{t("emptyDescription")}</p>
        </div>
      )}
      <div aria-live="polite" className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">
          {readiness === "AI_READY" ? t("aiReady") : t("incomplete")}
        </span>
        <span className="text-sm text-muted-foreground">{t("statusDescription")}</span>
        {dirty && <span className="text-sm font-medium text-destructive">{t("unsaved")}</span>}
        {!dirty && baseVersionId && (
          <span className="text-sm text-muted-foreground">{t("saved")}</span>
        )}
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm"
        >
          {error === "CONFLICT" ? (
            <>
              <p>{t("conflict")}</p>
              <Button className="mt-3" type="button" variant="outline" onClick={reloadLatest}>
                {t("reloadLatest")}
              </Button>
            </>
          ) : (
            t(error === "VALIDATION_ERROR" ? "validation" : "genericError")
          )}
        </div>
      )}
      <div>
        <h2 className="text-xl font-semibold">{t("identity")}</h2>
        {text("creatorOrBrandDescription", t("creatorOrBrandDescription"))}
      </div>
      <div>
        <h2 className="text-xl font-semibold">{t("audience")}</h2>
        {text("targetAudienceDescription", t("targetAudienceDescription"))}
      </div>
      <div>
        <h2 className="text-xl font-semibold">{t("expertise")}</h2>
        {list("primaryTopics", t("primaryTopics"))}
      </div>
      <div>
        <h2 className="text-xl font-semibold">{t("voice")}</h2>
        {list("toneTraits", t("toneTraits"))}
        {text("preferredStyle", t("preferredStyle"))}
      </div>
      <div>
        <h2 className="text-xl font-semibold">{t("goals")}</h2>
        {list("contentGoals", t("contentGoals"))}
      </div>
      <div>
        <h2 className="text-xl font-semibold">{t("preferences")}</h2>
        {list("preferredFormats", t("preferredFormats"))}
        {list("topicsToAvoid", t("topicsToAvoid"))}
        {list("approachesToAvoid", t("approachesToAvoid"))}
        {text("additionalInstructions", t("additionalInstructions"))}
      </div>
      <div>
        <h2 className="text-xl font-semibold">{t("language")}</h2>
        <label className="mt-5 block text-sm font-medium">
          {t("defaultContentLanguage")}
          <select
            className="mt-2 block rounded-md border bg-background px-3 py-2 font-normal"
            value={values.defaultContentLanguage}
            onChange={(event) =>
              update(
                "defaultContentLanguage",
                event.target.value as EditorValues["defaultContentLanguage"],
              )
            }
          >
            <option value="">—</option>
            <option value="en">{t("english")}</option>
            <option value="fa">{t("persian")}</option>
          </select>
        </label>
        <fieldset className="mt-5">
          <legend className="text-sm font-medium">{t("contentLanguages")}</legend>
          {(["en", "fa"] as const).map((language) => (
            <label className="mt-2 flex items-center gap-2" key={language}>
              <input
                type="checkbox"
                checked={values.contentLanguages.includes(language)}
                onChange={(event) =>
                  update(
                    "contentLanguages",
                    event.target.checked
                      ? [...values.contentLanguages, language]
                      : values.contentLanguages.filter((item) => item !== language),
                  )
                }
              />
              {language === "en" ? t("english") : t("persian")}
            </label>
          ))}
        </fieldset>
      </div>
      <aside className="rounded-lg border bg-muted/40 p-5" aria-labelledby="privacy-notice">
        <h2 className="font-semibold" id="privacy-notice">
          {t("privacyTitle")}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("privacyDescription")}</p>
      </aside>
      <Button type="submit" disabled={saving}>
        {saving ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
