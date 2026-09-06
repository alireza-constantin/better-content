"use client";

import { ChevronDownIcon, ChevronUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPortal,
  DialogTitle,
  DialogViewport,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  editDirectionTypes,
  performanceDirectionTypes,
  productionDirectionLimits,
  productionDirectionValues,
  type ContentDocumentV2,
} from "../domain";
import {
  addDirection,
  deleteDirection,
  moveDirection,
  replaceDirection,
  type DirectionCategory,
  type ProductionDirection,
} from "./direction-operations";

type Props = Readonly<{
  block: ContentDocumentV2["script"]["blocks"][number];
  document: ContentDocumentV2;
  disabled: boolean;
  language: "en" | "fa";
  onChange: (document: ContentDocumentV2) => void;
}>;
type EditorState = Readonly<{
  category: DirectionCategory;
  direction?: ProductionDirection;
}> | null;

type DirectionType =
  (typeof performanceDirectionTypes)[number] | (typeof editDirectionTypes)[number];

function summary(direction: ProductionDirection, t: ReturnType<typeof useTranslations>) {
  const type = t(`directionType${direction.type}`);
  switch (direction.type) {
    case "PAUSE":
      return `${type} · ${t(`directionValue${direction.duration}`)}`;
    case "EMPHASIS":
      return `${type} · ${t(`directionValue${direction.strength}`)}`;
    case "DELIVERY":
      return `${type} · ${[direction.tone, direction.pace]
        .filter(Boolean)
        .map((value) => t(`directionValue${value}`))
        .join(" · ")}`;
    case "GESTURE":
      return `${type} · ${t(`directionValue${direction.kind}`)}`;
    case "POSITION":
      return `${type} · ${t(`directionValue${direction.action}`)}`;
    case "GAZE":
      return `${type} · ${t(`directionValue${direction.target}`)}`;
    case "PERFORMANCE_NOTE":
    case "EDIT_NOTE":
      return direction.text || type;
    case "TEXT_OVERLAY":
      return `${type} · ${direction.text}`;
    case "ZOOM":
      return `${type} · ${t(`directionValue${direction.intensity}`)}`;
    case "CUT":
      return `${type} · ${t(`directionValue${direction.style}`)}`;
    case "BROLL_CUE":
      return `${t("directionTypeBROLL_CUE")} · ${direction.description}`;
    case "SOUND_CUE":
      return `${type} · ${direction.description}`;
    case "CAPTION_EMPHASIS":
      return `${type} · ${t(`directionValue${direction.style}`)}`;
  }
}

function DirectionForm({
  state,
  language,
  disabled,
  onClose,
  onSubmit,
}: Readonly<{
  state: Exclude<EditorState, null>;
  language: "en" | "fa";
  disabled: boolean;
  onClose: () => void;
  onSubmit: (direction: ProductionDirection) => boolean;
}>) {
  const t = useTranslations("Content");
  const existing = state.direction;
  const [type, setType] = useState<DirectionType>(
    existing?.type ?? (state.category === "performanceDirections" ? "PAUSE" : "TEXT_OVERLAY"),
  );
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...(existing ?? {}) }));
  const [error, setError] = useState<string | null>(null);
  const contentDir = language === "fa" ? "rtl" : "ltr";
  const value = (key: string) => values[key] ?? "";
  const set = (key: string, next: string) => setValues((current) => ({ ...current, [key]: next }));
  const option = (key: string, choices: readonly string[], required = true) => (
    <label className="grid gap-1.5 text-sm font-medium" htmlFor={`direction-${key}`}>
      {t(`directionField${key[0].toUpperCase()}${key.slice(1)}`)}
      <select
        autoComplete="off"
        className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        id={`direction-${key}`}
        name={key}
        onChange={(event) => set(key, event.target.value)}
        required={required}
        value={value(key) || (required ? choices[0] : "")}
      >
        {!required ? <option value="">{t("directionNone")}</option> : null}
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {t(`directionValue${choice}`)}
          </option>
        ))}
      </select>
    </label>
  );
  const text = (key: "text" | "description" | "nuance", maxLength: number, required = true) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`direction-${key}`}>
        {t(`directionField${key[0].toUpperCase()}${key.slice(1)}`)}
      </Label>
      <Textarea
        dir={contentDir}
        id={`direction-${key}`}
        lang={language}
        maxLength={maxLength}
        onChange={(event) => set(key, event.target.value)}
        required={required}
        rows={key === "nuance" ? 2 : 4}
        value={value(key)}
      />
      <p className="text-xs text-muted-foreground">
        {value(key).length}/{maxLength}
      </p>
    </div>
  );
  const addNuance = !["PERFORMANCE_NOTE", "EDIT_NOTE"].includes(type);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const shared = addNuance && value("nuance") ? { nuance: value("nuance") } : {};
    let candidate: ProductionDirection;
    const id = existing?.id ?? crypto.randomUUID();
    switch (type) {
      case "PAUSE":
        candidate = {
          id,
          type,
          duration: (value("duration") || "short") as "short" | "medium" | "long",
          ...shared,
        };
        break;
      case "EMPHASIS":
        candidate = {
          id,
          type,
          strength: (value("strength") || "subtle") as "subtle" | "clear" | "strong",
          ...shared,
        };
        break;
      case "DELIVERY":
        candidate = {
          id,
          type,
          ...(value("tone")
            ? {
                tone: value("tone") as "calm" | "warm" | "serious" | "energetic" | "playful",
              }
            : {}),
          ...(value("pace") ? { pace: value("pace") as "slower" | "faster" } : {}),
          ...shared,
        } as ProductionDirection;
        break;
      case "GESTURE":
        candidate = { id, type, kind: value("kind") || "hand", ...shared } as ProductionDirection;
        break;
      case "POSITION":
        candidate = {
          id,
          type,
          action: value("action") || "sit",
          ...shared,
        } as ProductionDirection;
        break;
      case "GAZE":
        candidate = {
          id,
          type,
          target: value("target") || "camera",
          ...shared,
        } as ProductionDirection;
        break;
      case "PERFORMANCE_NOTE":
      case "EDIT_NOTE":
        candidate = { id, type, text: value("text") } as ProductionDirection;
        break;
      case "TEXT_OVERLAY":
        candidate = {
          id,
          type,
          text: value("text"),
          placement: value("placement") || "center",
          ...shared,
        } as ProductionDirection;
        break;
      case "ZOOM":
        candidate = {
          id,
          type,
          mode: value("mode") || "in",
          intensity: value("intensity") || "subtle",
          ...shared,
        } as ProductionDirection;
        break;
      case "CUT":
        candidate = { id, type, style: value("style") || "hard", ...shared } as ProductionDirection;
        break;
      case "BROLL_CUE":
        candidate = {
          id,
          type,
          description: value("description"),
          ...shared,
        } as ProductionDirection;
        break;
      case "SOUND_CUE":
        candidate = {
          id,
          type,
          kind: value("kind") || "music",
          description: value("description"),
          ...shared,
        } as ProductionDirection;
        break;
      case "CAPTION_EMPHASIS":
        candidate = {
          id,
          type,
          style: value("style") || "highlight",
          ...shared,
        } as ProductionDirection;
        break;
      default:
        return;
    }
    if (!disabled && !onSubmit(candidate)) setError(t("directionValidationError"));
  };
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogPortal>
        <DialogBackdrop />
        <DialogViewport className="items-end p-0 sm:items-center sm:p-4">
          <DialogContent className="max-h-[90dvh] max-w-xl rounded-b-none rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-2xl sm:p-7">
            <DialogHeader>
              <DialogTitle>{existing ? t("editDirection") : t("addDirection")}</DialogTitle>
              <DialogDescription>{t("directionFormDescription")}</DialogDescription>
            </DialogHeader>
            <form className="mt-5 grid gap-4" onSubmit={submit}>
              {!existing ? (
                <label className="grid gap-1.5 text-sm font-medium" htmlFor="direction-type">
                  {t("directionType")}
                  <select
                    autoComplete="off"
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    id="direction-type"
                    name="type"
                    onChange={(event) => {
                      setType(event.target.value as DirectionType);
                      setValues({});
                    }}
                    value={type}
                  >
                    {(state.category === "performanceDirections"
                      ? performanceDirectionTypes
                      : editDirectionTypes
                    ).map((entry) => (
                      <option key={entry} value={entry}>
                        {t(`directionType${entry}`)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {type === "PAUSE" && option("duration", productionDirectionValues.duration)}
              {type === "EMPHASIS" && option("strength", productionDirectionValues.strength)}
              {type === "DELIVERY" && (
                <div className="grid grid-cols-2 gap-3">
                  {option("tone", productionDirectionValues.tone, false)}
                  {option("pace", productionDirectionValues.pace, false)}
                </div>
              )}
              {type === "GESTURE" && option("kind", productionDirectionValues.gesture)}
              {type === "POSITION" && option("action", productionDirectionValues.position)}
              {type === "GAZE" && option("target", productionDirectionValues.gaze)}
              {["PERFORMANCE_NOTE", "EDIT_NOTE"].includes(type) &&
                text("text", productionDirectionLimits.note)}
              {type === "TEXT_OVERLAY" && (
                <>
                  <>{text("text", productionDirectionLimits.overlay)}</>
                  {option("placement", productionDirectionValues.placement)}
                </>
              )}
              {type === "ZOOM" && (
                <div className="grid grid-cols-2 gap-3">
                  {option("mode", productionDirectionValues.zoomMode)}
                  {option("intensity", productionDirectionValues.zoomIntensity)}
                </div>
              )}
              {type === "CUT" && option("style", productionDirectionValues.cut)}
              {type === "BROLL_CUE" && text("description", productionDirectionLimits.note)}
              {type === "SOUND_CUE" && (
                <>
                  {option("kind", productionDirectionValues.soundKind)}
                  {text("description", productionDirectionLimits.soundCue)}
                </>
              )}
              {type === "CAPTION_EMPHASIS" && option("style", productionDirectionValues.caption)}
              {addNuance ? text("nuance", productionDirectionLimits.nuance, false) : null}
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              <DialogFooter className="mt-2 justify-end">
                <DialogClose className="inline-flex h-8 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted">
                  {t("cancel")}
                </DialogClose>
                <Button disabled={disabled} type="submit">
                  {existing ? t("saveDirection") : t("addDirection")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </DialogViewport>
      </DialogPortal>
    </Dialog>
  );
}

export function BlockProductionDirections({
  block,
  document,
  disabled,
  language,
  onChange,
}: Props) {
  const t = useTranslations("Content");
  const uiLocale = useLocale();
  const [state, setState] = useState<EditorState>(null);
  const [collapsed, setCollapsed] = useState<Record<DirectionCategory, boolean>>({
    performanceDirections: false,
    editDirections: false,
  });
  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null);
  const groups: readonly [DirectionCategory, readonly ProductionDirection[], string][] = [
    ["performanceDirections", block.performanceDirections, t("performanceDirections")],
    ["editDirections", block.editDirections, t("editDirections")],
  ];
  const totalDirections = document.script.blocks.reduce(
    (count, item) => count + item.performanceDirections.length + item.editDirections.length,
    0,
  );
  const apply = (next: ContentDocumentV2 | null) => {
    if (next) onChange(next);
  };
  return (
    <div
      className="ms-6 mt-1 border-s border-border/70 ps-3 sm:ms-7"
      dir={uiLocale === "fa" ? "rtl" : "ltr"}
      lang={uiLocale}
    >
      {groups.map(([category, directions, title]) => (
        <section className="py-1" key={category} aria-label={title}>
          <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Button
              aria-expanded={!collapsed[category]}
              aria-label={title}
              className="min-h-9 sm:min-h-6"
              onClick={() =>
                setCollapsed((current) => ({ ...current, [category]: !current[category] }))
              }
              size="xs"
              type="button"
              variant="ghost"
            >
              {collapsed[category] ? <ChevronDownIcon /> : <ChevronUpIcon />}
              {title}
              {directions.length ? ` (${directions.length})` : ""}
            </Button>
            <Button
              aria-describedby={
                directions.length >= productionDirectionLimits.perBlockCategory ||
                totalDirections >= productionDirectionLimits.perDocument
                  ? `${category}-limit`
                  : undefined
              }
              className="min-h-9 sm:min-h-6"
              disabled={
                disabled ||
                directions.length >= productionDirectionLimits.perBlockCategory ||
                totalDirections >= productionDirectionLimits.perDocument
              }
              onClick={() => setState({ category })}
              size="xs"
              type="button"
              variant="ghost"
            >
              <PlusIcon />
              {t("addDirection")}
            </Button>
            {directions.length >= productionDirectionLimits.perBlockCategory ||
            totalDirections >= productionDirectionLimits.perDocument ? (
              <span className="sr-only" id={`${category}-limit`}>
                {t("directionLimitReached")}
              </span>
            ) : null}
          </div>
          {!collapsed[category] && directions.length ? (
            <ul className="mt-1 flex flex-wrap gap-1" aria-label={title}>
              {directions.map((direction, index) => (
                <li
                  className="flex max-w-full items-center rounded-md border border-border/70 bg-muted/35"
                  key={direction.id}
                >
                  <Button
                    className="max-w-48 truncate"
                    dir={language === "fa" ? "rtl" : "ltr"}
                    disabled={disabled}
                    lang={language}
                    onClick={() => setState({ category, direction })}
                    size="xs"
                    type="button"
                    variant="ghost"
                  >
                    {summary(direction, t)}
                  </Button>
                  <details className="relative">
                    <summary
                      className="cursor-pointer list-none px-1 text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                      aria-label={t("directionActionsFor", { direction: summary(direction, t) })}
                    >
                      •••
                    </summary>
                    <div className="absolute end-0 z-10 mt-1 grid min-w-36 rounded-md border bg-popover p-1 shadow-md">
                      <Button
                        className="min-h-9 sm:min-h-6"
                        disabled={index === 0 || disabled}
                        onClick={() =>
                          apply(moveDirection(document, block.id, category, direction.id, -1))
                        }
                        size="xs"
                        type="button"
                        variant="ghost"
                      >
                        {t("moveEarlier")}
                      </Button>
                      <Button
                        className="min-h-9 sm:min-h-6"
                        disabled={index === directions.length - 1 || disabled}
                        onClick={() =>
                          apply(moveDirection(document, block.id, category, direction.id, 1))
                        }
                        size="xs"
                        type="button"
                        variant="ghost"
                      >
                        {t("moveLater")}
                      </Button>
                      <Button
                        className="min-h-9 sm:min-h-6"
                        disabled={disabled}
                        onClick={() => {
                          if (deleteCandidate === direction.id) {
                            apply(deleteDirection(document, block.id, category, direction.id));
                            setDeleteCandidate(null);
                          } else setDeleteCandidate(direction.id);
                        }}
                        size="xs"
                        type="button"
                        variant="destructive"
                      >
                        <Trash2Icon />
                        {deleteCandidate === direction.id
                          ? t("confirmDeleteDirection")
                          : t("deleteDirection")}
                      </Button>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
      {state ? (
        <DirectionForm
          disabled={disabled}
          language={language}
          onClose={() => setState(null)}
          state={state}
          onSubmit={(direction) => {
            const next = state.direction
              ? replaceDirection(document, block.id, state.category, direction)
              : addDirection(document, block.id, state.category, direction);
            if (!next) return false;
            onChange(next);
            setState(null);
            return true;
          }}
        />
      ) : null}
    </div>
  );
}
