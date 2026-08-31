import { z } from "zod";

import type { ContentDnaPayload } from "@/modules/dna/domain/content-dna-payload";

export type ContentLanguage = "en" | "fa";
export type ListItemValue = { value: string };

export type ContentDnaEditorValues = {
  creatorOrBrandDescription: string;
  targetAudienceDescription: string;
  primaryTopics: ListItemValue[];
  toneTraits: ListItemValue[];
  preferredStyle: string;
  contentGoals: ListItemValue[];
  preferredFormats: ListItemValue[];
  topicsToAvoid: ListItemValue[];
  approachesToAvoid: ListItemValue[];
  additionalInstructions: string;
  defaultContentLanguage: "" | ContentLanguage;
  contentLanguages: ContentLanguage[];
};

type Translate = (key: string, values?: Record<string, string | number>) => string;

const listItemSchema = (maximum: number, t: Translate) =>
  z.object({
    value: z.string().max(maximum, t("validationMaxLength", { maximum })),
  });

export function createContentDnaEditorSchema(t: Translate) {
  return z
    .object({
      creatorOrBrandDescription: z.string().max(1500, t("validationMaxLength", { maximum: 1500 })),
      targetAudienceDescription: z.string().max(1500, t("validationMaxLength", { maximum: 1500 })),
      primaryTopics: z
        .array(listItemSchema(80, t))
        .max(10, t("validationMaxItems", { maximum: 10 })),
      toneTraits: z.array(listItemSchema(60, t)).max(5, t("validationMaxItems", { maximum: 5 })),
      preferredStyle: z.string().max(1200, t("validationMaxLength", { maximum: 1200 })),
      contentGoals: z.array(listItemSchema(120, t)).max(5, t("validationMaxItems", { maximum: 5 })),
      preferredFormats: z
        .array(listItemSchema(80, t))
        .max(8, t("validationMaxItems", { maximum: 8 })),
      topicsToAvoid: z
        .array(listItemSchema(120, t))
        .max(10, t("validationMaxItems", { maximum: 10 })),
      approachesToAvoid: z
        .array(listItemSchema(160, t))
        .max(10, t("validationMaxItems", { maximum: 10 })),
      additionalInstructions: z.string().max(2000, t("validationMaxLength", { maximum: 2000 })),
      defaultContentLanguage: z.enum(["", "en", "fa"]),
      contentLanguages: z.array(z.enum(["en", "fa"])).max(2),
    })
    .superRefine((values, context) => {
      if (
        values.defaultContentLanguage &&
        !values.contentLanguages.includes(values.defaultContentLanguage)
      ) {
        context.addIssue({
          code: "custom",
          path: ["defaultContentLanguage"],
          message: t("validationDefaultLanguage"),
        });
      }
    });
}

function listValues(values: readonly string[] | undefined): ListItemValue[] {
  const entries = values?.map((item) => ({ value: item })) ?? [];
  return entries.length > 0 ? entries : [{ value: "" }];
}

export function editorValuesFromPayload(payload?: ContentDnaPayload): ContentDnaEditorValues {
  return {
    creatorOrBrandDescription: payload?.identity?.creatorOrBrandDescription ?? "",
    targetAudienceDescription: payload?.audience?.targetAudienceDescription ?? "",
    primaryTopics: listValues(payload?.expertise?.primaryTopics),
    toneTraits: listValues(payload?.voice?.toneTraits),
    preferredStyle: payload?.voice?.preferredStyle ?? "",
    contentGoals: listValues(payload?.goals?.contentGoals),
    preferredFormats: listValues(payload?.preferences?.preferredFormats),
    topicsToAvoid: listValues(payload?.preferences?.topicsToAvoid),
    approachesToAvoid: listValues(payload?.preferences?.approachesToAvoid),
    additionalInstructions: payload?.preferences?.additionalInstructions ?? "",
    defaultContentLanguage: payload?.language?.defaultContentLanguage ?? "",
    contentLanguages: [...(payload?.language?.contentLanguages ?? [])],
  };
}

function compactList(values: readonly ListItemValue[]): string[] {
  return values.map(({ value }) => value).filter((value) => value.trim().length > 0);
}

export function payloadFromEditorValues(values: ContentDnaEditorValues): unknown {
  return {
    schemaVersion: 1,
    identity: { creatorOrBrandDescription: values.creatorOrBrandDescription },
    audience: { targetAudienceDescription: values.targetAudienceDescription },
    expertise: { primaryTopics: compactList(values.primaryTopics) },
    voice: {
      toneTraits: compactList(values.toneTraits),
      preferredStyle: values.preferredStyle,
    },
    goals: { contentGoals: compactList(values.contentGoals) },
    preferences: {
      preferredFormats: compactList(values.preferredFormats),
      topicsToAvoid: compactList(values.topicsToAvoid),
      approachesToAvoid: compactList(values.approachesToAvoid),
      additionalInstructions: values.additionalInstructions,
    },
    language: {
      defaultContentLanguage: values.defaultContentLanguage,
      contentLanguages: values.contentLanguages,
    },
  };
}
