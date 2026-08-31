"use client";

import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import type { ContentDnaEditorValues } from "./content-dna-editor-form";

type TextFieldName =
  | "creatorOrBrandDescription"
  | "targetAudienceDescription"
  | "preferredStyle"
  | "additionalInstructions";

export type ListFieldName =
  | "primaryTopics"
  | "toneTraits"
  | "contentGoals"
  | "preferredFormats"
  | "topicsToAvoid"
  | "approachesToAvoid";

function EditorSection({
  title,
  description,
  children,
}: Readonly<{ title: string; description: string; children: ReactNode }>) {
  return (
    <Card className="shadow-none">
      <CardHeader className="border-b bg-muted/25">
        <CardTitle>
          <h3>{title}</h3>
        </CardTitle>
        <CardDescription className="max-w-2xl leading-6">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>{children}</FieldGroup>
      </CardContent>
    </Card>
  );
}

function TextareaField({
  name,
  label,
  description,
  placeholder,
}: Readonly<{ name: TextFieldName; label: string; description: string; placeholder: string }>) {
  const { register, formState } = useFormContext<ContentDnaEditorValues>();
  const error = formState.errors[name];
  const errorId = `${name}-error`;
  const descriptionId = `${name}-description`;

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <FieldDescription id={descriptionId}>{description}</FieldDescription>
      <Textarea
        {...register(name)}
        id={name}
        aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ""}`}
        aria-invalid={Boolean(error)}
        className="min-h-28 resize-y"
        placeholder={placeholder}
      />
      <FieldError id={errorId} errors={error ? [error] : undefined} />
    </Field>
  );
}

export function OrderedListField({
  name,
  label,
  description,
  ordered = false,
}: Readonly<{ name: ListFieldName; label: string; description: string; ordered?: boolean }>) {
  const t = useTranslations("ContentDna");
  const { control, register, formState } = useFormContext<ContentDnaEditorValues>();
  const { fields, append, remove, move } = useFieldArray({ control, name });
  const watchedValues = useWatch({ control, name });
  const listError = formState.errors[name];
  const listDescriptionId = `${name}-description`;
  const listErrorId = `${name}-error`;
  const listLevelError = listError && "message" in listError ? listError : undefined;

  return (
    <FieldSet aria-describedby={`${listDescriptionId}${listLevelError ? ` ${listErrorId}` : ""}`}>
      <FieldLegend variant="label">{label}</FieldLegend>
      <FieldDescription id={listDescriptionId}>{description}</FieldDescription>
      <div className="flex flex-col gap-3">
        {fields.map((field, index) => {
          const itemError = listError?.[index]?.value;
          const itemId = `${name}-${field.id}`;
          const itemErrorId = `${itemId}-error`;
          const value = watchedValues?.[index]?.value || String(index + 1);

          return (
            <Field key={field.id} data-invalid={Boolean(itemError)}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <Input
                  {...register(`${name}.${index}.value`)}
                  id={itemId}
                  aria-label={t("listItemLabel", { label, position: index + 1 })}
                  aria-describedby={itemError ? itemErrorId : undefined}
                  aria-invalid={Boolean(itemError)}
                  className="min-w-0 flex-1"
                  placeholder={t("newListItem")}
                />
                <div className="flex shrink-0 gap-1 self-end sm:self-auto">
                  {ordered && (
                    <>
                      <Button
                        type="button"
                        size="icon-lg"
                        variant="outline"
                        className="size-11 sm:size-9"
                        disabled={index === 0}
                        aria-label={t("moveUp", { value })}
                        onClick={() => move(index, index - 1)}
                      >
                        <ArrowUpIcon />
                      </Button>
                      <Button
                        type="button"
                        size="icon-lg"
                        variant="outline"
                        className="size-11 sm:size-9"
                        disabled={index === fields.length - 1}
                        aria-label={t("moveDown", { value })}
                        onClick={() => move(index, index + 1)}
                      >
                        <ArrowDownIcon />
                      </Button>
                    </>
                  )}
                  <Button
                    type="button"
                    size="icon-lg"
                    variant="ghost"
                    className="size-11 sm:size-9"
                    aria-label={t("remove", { value })}
                    onClick={() => remove(index)}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </div>
              <FieldError id={itemErrorId} errors={itemError ? [itemError] : undefined} />
            </Field>
          );
        })}
      </div>
      <Button
        type="button"
        variant="outline"
        className="min-h-11 w-fit"
        onClick={() => append({ value: "" })}
      >
        <PlusIcon data-icon="inline-start" />
        {t("addToList", { label })}
      </Button>
      <FieldError id={listErrorId} errors={listLevelError ? [listLevelError] : undefined} />
    </FieldSet>
  );
}

export function IdentitySection() {
  const t = useTranslations("ContentDna");
  return (
    <EditorSection title={t("identity")} description={t("identityDescription")}>
      <TextareaField
        name="creatorOrBrandDescription"
        label={t("creatorOrBrandDescription")}
        description={t("creatorOrBrandDescriptionHelp")}
        placeholder={t("creatorOrBrandDescriptionPlaceholder")}
      />
    </EditorSection>
  );
}

export function AudienceSection() {
  const t = useTranslations("ContentDna");
  return (
    <EditorSection title={t("audience")} description={t("audienceDescription")}>
      <TextareaField
        name="targetAudienceDescription"
        label={t("targetAudienceDescription")}
        description={t("targetAudienceDescriptionHelp")}
        placeholder={t("targetAudienceDescriptionPlaceholder")}
      />
    </EditorSection>
  );
}

export function ExpertiseSection() {
  const t = useTranslations("ContentDna");
  return (
    <EditorSection title={t("expertise")} description={t("expertiseDescription")}>
      <OrderedListField
        name="primaryTopics"
        label={t("primaryTopics")}
        description={t("primaryTopicsHelp")}
        ordered
      />
    </EditorSection>
  );
}

export function VoiceSection() {
  const t = useTranslations("ContentDna");
  return (
    <EditorSection title={t("voice")} description={t("voiceDescription")}>
      <OrderedListField
        name="toneTraits"
        label={t("toneTraits")}
        description={t("toneTraitsHelp")}
        ordered
      />
      <TextareaField
        name="preferredStyle"
        label={t("preferredStyle")}
        description={t("preferredStyleHelp")}
        placeholder={t("preferredStylePlaceholder")}
      />
    </EditorSection>
  );
}

export function GoalsSection() {
  const t = useTranslations("ContentDna");
  return (
    <EditorSection title={t("goals")} description={t("goalsDescription")}>
      <OrderedListField
        name="contentGoals"
        label={t("contentGoals")}
        description={t("contentGoalsHelp")}
        ordered
      />
    </EditorSection>
  );
}

export function PreferencesSection() {
  const t = useTranslations("ContentDna");
  return (
    <EditorSection title={t("preferences")} description={t("preferencesDescription")}>
      <OrderedListField
        name="preferredFormats"
        label={t("preferredFormats")}
        description={t("preferredFormatsHelp")}
      />
      <OrderedListField
        name="topicsToAvoid"
        label={t("topicsToAvoid")}
        description={t("topicsToAvoidHelp")}
      />
      <OrderedListField
        name="approachesToAvoid"
        label={t("approachesToAvoid")}
        description={t("approachesToAvoidHelp")}
      />
      <TextareaField
        name="additionalInstructions"
        label={t("additionalInstructions")}
        description={t("additionalInstructionsHelp")}
        placeholder={t("additionalInstructionsPlaceholder")}
      />
    </EditorSection>
  );
}

export function LanguageSection() {
  const t = useTranslations("ContentDna");
  const { control, formState } = useFormContext<ContentDnaEditorValues>();
  const defaultError = formState.errors.defaultContentLanguage;
  const defaultDescriptionId = "default-content-language-description";
  const defaultErrorId = "default-content-language-error";

  return (
    <EditorSection title={t("language")} description={t("languageDescription")}>
      <Controller
        control={control}
        name="defaultContentLanguage"
        render={({ field }) => (
          <Field data-invalid={Boolean(defaultError)}>
            <FieldLabel htmlFor="default-content-language">
              {t("defaultContentLanguage")}
            </FieldLabel>
            <FieldDescription id={defaultDescriptionId}>
              {t("defaultContentLanguageHelp")}
            </FieldDescription>
            <Select
              value={field.value || "not-set"}
              onValueChange={(value) => field.onChange(value === "not-set" ? "" : value)}
            >
              <SelectTrigger
                id="default-content-language"
                aria-describedby={`${defaultDescriptionId}${defaultError ? ` ${defaultErrorId}` : ""}`}
                aria-invalid={Boolean(defaultError)}
                className="w-full sm:max-w-72"
              >
                <SelectValue placeholder={t("selectLanguage")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="not-set">{t("notSet")}</SelectItem>
                  <SelectItem value="en">{t("english")}</SelectItem>
                  <SelectItem value="fa">{t("persian")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldError id={defaultErrorId} errors={defaultError ? [defaultError] : undefined} />
          </Field>
        )}
      />
      <Controller
        control={control}
        name="contentLanguages"
        render={({ field }) => (
          <FieldSet aria-describedby="content-languages-description">
            <FieldLegend variant="label">{t("contentLanguages")}</FieldLegend>
            <FieldDescription id="content-languages-description">
              {t("contentLanguagesHelp")}
            </FieldDescription>
            <div data-slot="checkbox-group" className="grid gap-3 sm:grid-cols-2">
              {(["en", "fa"] as const).map((language) => {
                const checked = field.value.includes(language);
                return (
                  <FieldLabel key={language}>
                    <Field orientation="horizontal">
                      <Checkbox
                        checked={checked}
                        aria-label={language === "en" ? t("english") : t("persian")}
                        onCheckedChange={(nextChecked) =>
                          field.onChange(
                            nextChecked
                              ? [...field.value, language]
                              : field.value.filter((value) => value !== language),
                          )
                        }
                      />
                      <span>{language === "en" ? t("english") : t("persian")}</span>
                    </Field>
                  </FieldLabel>
                );
              })}
            </div>
          </FieldSet>
        )}
      />
    </EditorSection>
  );
}
