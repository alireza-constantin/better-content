"use client";

import { useEffect, useRef, useState } from "react";

import type { ApplicationErrorCode } from "@/lib/errors/app-error";
import type { SaveContentDraftActionResult } from "../application/content-actions";
import type { ContentDetailDto, ContentDraftDto } from "../application/content-read-service";

export const CONTENT_DRAFT_AUTOSAVE_DEBOUNCE_MS = 850;

export type ContentDraftAutosaveStatus = "unsaved" | "saving" | "saved" | "failed" | "conflict";

export type AutosaveDocument = ContentDetailDto["draft"]["document"];

export type AutosaveSaveInput = Readonly<{
  workspaceId: string;
  contentId: string;
  baseRevision: number;
  document: AutosaveDocument;
}>;

export type AutosaveSaveResult = SaveContentDraftActionResult;

export type AutosaveReloadResult =
  | Readonly<{ ok: true; draft: ContentDraftDto }>
  | Readonly<{ ok: false; code?: ApplicationErrorCode }>;

type ContentDraftAutosaveOptions = Readonly<{
  workspaceId: string;
  contentId: string;
  initialDocument: AutosaveDocument;
  initialRevision: number;
  save: (input: AutosaveSaveInput) => Promise<AutosaveSaveResult>;
  reload: () => Promise<AutosaveReloadResult>;
  debounceMs?: number;
}>;

type ContentDraftAutosaveResult = Readonly<{
  text: string;
  revision: number;
  status: ContentDraftAutosaveStatus;
  isDirty: boolean;
  isSaving: boolean;
  isReloading: boolean;
  isCopying: boolean;
  failureCode: ApplicationErrorCode | null;
  reloadError: boolean;
  copyFeedback: "copied" | "failed" | null;
  onChange: (text: string) => void;
  saveNow: () => void;
  reload: () => Promise<void>;
  copyUnsaved: () => Promise<void>;
}>;

function documentForText(text: string): AutosaveDocument {
  return { schemaVersion: 1, script: { text } };
}

/**
 * Owns the browser-side Draft save protocol. The refs are the authoritative
 * client snapshot so promise continuations always compare against the latest
 * text, even when React has not rendered the most recent keystroke yet.
 */
export function useContentDraftAutosave({
  workspaceId,
  contentId,
  initialDocument,
  initialRevision,
  save,
  reload,
  debounceMs = CONTENT_DRAFT_AUTOSAVE_DEBOUNCE_MS,
}: ContentDraftAutosaveOptions): ContentDraftAutosaveResult {
  const initialText = initialDocument.script.text;
  const [text, setText] = useState(initialText);
  const [persistedText, setPersistedText] = useState(initialText);
  const [revision, setRevision] = useState(initialRevision);
  const [status, setStatus] = useState<ContentDraftAutosaveStatus>("saved");
  const [isSaving, setIsSaving] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [failureCode, setFailureCode] = useState<ApplicationErrorCode | null>(null);
  const [reloadError, setReloadError] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<"copied" | "failed" | null>(null);

  const mountedRef = useRef(true);
  const latestTextRef = useRef(initialText);
  const persistedTextRef = useRef(initialText);
  const baseRevisionRef = useRef(initialRevision);
  const saveRef = useRef(save);
  const reloadRef = useRef(reload);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const blockedRef = useRef(false);
  const explicitSaveRequiredRef = useRef(false);
  const reloadingRef = useRef(false);
  const copyingRef = useRef(false);

  saveRef.current = save;
  reloadRef.current = reload;

  function clearDebounceTimer(): void {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function markSaveFailure(code: ApplicationErrorCode): void {
    if (!mountedRef.current) {
      return;
    }

    inFlightRef.current = false;
    setIsSaving(false);

    if (code === "CONFLICT") {
      blockedRef.current = true;
      explicitSaveRequiredRef.current = false;
      clearDebounceTimer();
      setFailureCode(null);
      setReloadError(false);
      setStatus("conflict");
      return;
    }

    explicitSaveRequiredRef.current = true;
    setFailureCode(code);
    setStatus("failed");
  }

  function startSave(documentText: string, baseRevision: number): void {
    if (!mountedRef.current || blockedRef.current || inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;
    setIsSaving(true);
    setFailureCode(null);
    setReloadError(false);
    setCopyFeedback(null);
    setStatus("saving");

    const submittedText = documentText;
    let savePromise: Promise<AutosaveSaveResult>;

    try {
      savePromise = saveRef.current({
        workspaceId,
        contentId,
        baseRevision,
        document: documentForText(submittedText),
      });
    } catch {
      markSaveFailure("INTERNAL_ERROR");
      return;
    }

    void Promise.resolve(savePromise)
      .then((result) => {
        if (!mountedRef.current) {
          return;
        }

        inFlightRef.current = false;
        setIsSaving(false);

        if (!result.ok) {
          markSaveFailure(result.code);
          return;
        }

        const savedText = result.draft.document.script.text;
        baseRevisionRef.current = result.draft.revision;
        persistedTextRef.current = savedText;
        setRevision(result.draft.revision);
        setPersistedText(savedText);
        setFailureCode(null);
        setReloadError(false);

        if (latestTextRef.current === submittedText) {
          latestTextRef.current = savedText;
          setText(savedText);
          setStatus("saved");
          return;
        }

        // The response advanced the base revision, but a newer local value
        // must win the client queue. Start exactly one follow-up request with
        // that latest value and the newly authoritative revision.
        setStatus("unsaved");
        startSave(latestTextRef.current, result.draft.revision);
      })
      .catch(() => {
        markSaveFailure("INTERNAL_ERROR");
      });
  }

  function scheduleDebouncedSave(): void {
    clearDebounceTimer();

    if (
      !mountedRef.current ||
      blockedRef.current ||
      explicitSaveRequiredRef.current ||
      inFlightRef.current ||
      latestTextRef.current === persistedTextRef.current
    ) {
      return;
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null;

      if (
        !mountedRef.current ||
        blockedRef.current ||
        explicitSaveRequiredRef.current ||
        inFlightRef.current ||
        latestTextRef.current === persistedTextRef.current
      ) {
        return;
      }

      startSave(latestTextRef.current, baseRevisionRef.current);
    }, debounceMs);
  }

  function onChange(nextText: string): void {
    latestTextRef.current = nextText;
    setText(nextText);
    setCopyFeedback(null);

    if (blockedRef.current) {
      setStatus("conflict");
      return;
    }

    if (inFlightRef.current) {
      setStatus("saving");
      return;
    }

    if (nextText === persistedTextRef.current) {
      explicitSaveRequiredRef.current = false;
      clearDebounceTimer();
      setFailureCode(null);
      setStatus("saved");
      return;
    }

    if (explicitSaveRequiredRef.current) {
      setStatus("unsaved");
      return;
    }

    setFailureCode(null);
    setStatus("unsaved");
    scheduleDebouncedSave();
  }

  function saveNow(): void {
    if (!mountedRef.current || blockedRef.current || inFlightRef.current) {
      return;
    }

    clearDebounceTimer();
    explicitSaveRequiredRef.current = false;

    if (latestTextRef.current === persistedTextRef.current) {
      setFailureCode(null);
      setStatus("saved");
      return;
    }

    startSave(latestTextRef.current, baseRevisionRef.current);
  }

  async function reloadDraft(): Promise<void> {
    if (!mountedRef.current || !blockedRef.current || inFlightRef.current || reloadingRef.current) {
      return;
    }

    clearDebounceTimer();
    reloadingRef.current = true;
    setIsReloading(true);
    setReloadError(false);

    let result: AutosaveReloadResult;

    try {
      result = await reloadRef.current();
    } catch {
      result = { ok: false, code: "INTERNAL_ERROR" };
    }

    if (!mountedRef.current) {
      return;
    }

    reloadingRef.current = false;
    setIsReloading(false);

    if (!result.ok) {
      setReloadError(true);
      setStatus("conflict");
      return;
    }

    const authoritativeText = result.draft.document.script.text;
    latestTextRef.current = authoritativeText;
    persistedTextRef.current = authoritativeText;
    baseRevisionRef.current = result.draft.revision;
    blockedRef.current = false;
    explicitSaveRequiredRef.current = false;
    setText(authoritativeText);
    setPersistedText(authoritativeText);
    setRevision(result.draft.revision);
    setFailureCode(null);
    setReloadError(false);
    setCopyFeedback(null);
    setStatus("saved");
  }

  async function copyUnsaved(): Promise<void> {
    if (!mountedRef.current || !blockedRef.current || copyingRef.current) {
      return;
    }

    copyingRef.current = true;
    setIsCopying(true);
    setCopyFeedback(null);

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard access is unavailable.");
      }

      await navigator.clipboard.writeText(latestTextRef.current);

      if (mountedRef.current) {
        setCopyFeedback("copied");
      }
    } catch {
      if (mountedRef.current) {
        setCopyFeedback("failed");
      }
    } finally {
      copyingRef.current = false;

      if (mountedRef.current) {
        setIsCopying(false);
      }
    }
  }

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      clearDebounceTimer();
    };
  }, []);

  return {
    text,
    revision,
    status,
    isDirty: text !== persistedText,
    isSaving,
    isReloading,
    isCopying,
    failureCode,
    reloadError,
    copyFeedback,
    onChange,
    saveNow,
    reload: reloadDraft,
    copyUnsaved,
  };
}
