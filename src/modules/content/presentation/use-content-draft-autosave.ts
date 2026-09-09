"use client";

import { useEffect, useRef, useState } from "react";

import type { ApplicationErrorCode } from "@/lib/errors/app-error";
import type { SaveContentDraftActionResult } from "../application/content-actions";
import type { ContentDraftDto } from "../application/content-read-service";
import {
  contentDocumentsEqual,
  exportContentDocumentV3Recovery,
  exportContentDocumentV2Recovery,
  type ContentDocumentV2,
  type ContentDocumentV3,
  type ContentDocumentV4,
} from "../domain";

export const CONTENT_DRAFT_AUTOSAVE_DEBOUNCE_MS = 850;
export type ContentDraftAutosaveStatus = "unsaved" | "saving" | "saved" | "failed" | "conflict";
export type AutosaveDocument = ContentDocumentV2 | ContentDocumentV3 | ContentDocumentV4;
const defaultRecoveryExport = (document: AutosaveDocument) =>
  document.schemaVersion === 3 || document.schemaVersion === 4
    ? exportContentDocumentV3Recovery(document)
    : exportContentDocumentV2Recovery(document);
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
type Options = Readonly<{
  workspaceId: string;
  contentId: string;
  initialDocument: AutosaveDocument;
  initialRevision: number;
  save: (input: AutosaveSaveInput) => Promise<AutosaveSaveResult>;
  reload: () => Promise<AutosaveReloadResult>;
  debounceMs?: number;
  recoveryExport?: (document: AutosaveDocument) => string;
}>;
type Result = Readonly<{
  document: AutosaveDocument;
  revision: number;
  status: ContentDraftAutosaveStatus;
  isDirty: boolean;
  isSaving: boolean;
  isReloading: boolean;
  isCopying: boolean;
  failureCode: ApplicationErrorCode | null;
  reloadError: boolean;
  copyFeedback: "copied" | "failed" | null;
  onChange: (document: AutosaveDocument) => void;
  adoptPersistedDraft: (draft: ContentDraftDto) => void;
  saveNow: () => void;
  reload: () => Promise<void>;
  copyUnsaved: () => Promise<void>;
}>;

function requireV3(draft: ContentDraftDto): ContentDocumentV3 | ContentDocumentV4 {
  return draft.editorDocument;
}

/** Serializes whole-document saves; refs ensure responses cannot overwrite newer local editing. */
export function useContentDraftAutosave({
  workspaceId,
  contentId,
  initialDocument,
  initialRevision,
  save,
  reload,
  debounceMs = CONTENT_DRAFT_AUTOSAVE_DEBOUNCE_MS,
  recoveryExport = defaultRecoveryExport,
}: Options): Result {
  const [document, setDocument] = useState(initialDocument);
  const [persistedDocument, setPersistedDocument] = useState(initialDocument);
  const [revision, setRevision] = useState(initialRevision);
  const [status, setStatus] = useState<ContentDraftAutosaveStatus>("saved");
  const [isSaving, setIsSaving] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [failureCode, setFailureCode] = useState<ApplicationErrorCode | null>(null);
  const [reloadError, setReloadError] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<"copied" | "failed" | null>(null);
  const mounted = useRef(true);
  const latest = useRef(initialDocument);
  const persisted = useRef(initialDocument);
  const baseRevision = useRef(initialRevision);
  const saveRef = useRef(save);
  const reloadRef = useRef(reload);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const blocked = useRef(false);
  const explicit = useRef(false);
  const reloading = useRef(false);
  const copying = useRef(false);
  useEffect(() => {
    saveRef.current = save;
    reloadRef.current = reload;
  }, [reload, save]);
  const equal = (left: AutosaveDocument, right: AutosaveDocument) =>
    contentDocumentsEqual(left, right);
  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  const fail = (code: ApplicationErrorCode) => {
    if (!mounted.current) return;
    inFlight.current = false;
    setIsSaving(false);
    if (code === "CONFLICT") {
      blocked.current = true;
      explicit.current = false;
      clearTimer();
      setFailureCode(null);
      setReloadError(false);
      setStatus("conflict");
      return;
    }
    explicit.current = true;
    setFailureCode(code);
    setStatus("failed");
  };
  const start = (candidate: AutosaveDocument, base: number) => {
    if (!mounted.current || blocked.current || inFlight.current) return;
    inFlight.current = true;
    setIsSaving(true);
    setFailureCode(null);
    setReloadError(false);
    setCopyFeedback(null);
    setStatus("saving");
    Promise.resolve(
      saveRef.current({ workspaceId, contentId, baseRevision: base, document: candidate }),
    )
      .then((result) => {
        if (!mounted.current) return;
        inFlight.current = false;
        setIsSaving(false);
        if (!result.ok) {
          fail(result.code);
          return;
        }
        const saved = requireV3(result.draft);
        baseRevision.current = result.draft.revision;
        persisted.current = saved;
        setPersistedDocument(saved);
        setRevision(result.draft.revision);
        setFailureCode(null);
        setReloadError(false);
        if (equal(latest.current, candidate)) {
          latest.current = saved;
          setDocument(saved);
          setStatus("saved");
          return;
        }
        setStatus("unsaved");
        start(latest.current, result.draft.revision);
      })
      .catch(() => fail("INTERNAL_ERROR"));
  };
  const schedule = () => {
    clearTimer();
    if (
      !mounted.current ||
      blocked.current ||
      explicit.current ||
      inFlight.current ||
      equal(latest.current, persisted.current)
    )
      return;
    timer.current = setTimeout(() => {
      timer.current = null;
      if (
        !blocked.current &&
        !explicit.current &&
        !inFlight.current &&
        !equal(latest.current, persisted.current)
      )
        start(latest.current, baseRevision.current);
    }, debounceMs);
  };
  const onChange = (next: AutosaveDocument) => {
    latest.current = next;
    setDocument(next);
    setCopyFeedback(null);
    if (blocked.current) {
      setStatus("conflict");
      return;
    }
    if (inFlight.current) {
      setStatus("saving");
      return;
    }
    if (equal(next, persisted.current)) {
      explicit.current = false;
      clearTimer();
      setFailureCode(null);
      setStatus("saved");
      return;
    }
    if (explicit.current) {
      setStatus("unsaved");
      return;
    }
    setFailureCode(null);
    setStatus("unsaved");
    schedule();
  };
  const saveNow = () => {
    if (!mounted.current || blocked.current || inFlight.current) return;
    clearTimer();
    explicit.current = false;
    if (equal(latest.current, persisted.current)) {
      setFailureCode(null);
      setStatus("saved");
      return;
    }
    start(latest.current, baseRevision.current);
  };
  const adoptPersistedDraft = (draft: ContentDraftDto) => {
    const authoritative = requireV3(draft);
    clearTimer();
    latest.current = authoritative;
    persisted.current = authoritative;
    baseRevision.current = draft.revision;
    blocked.current = false;
    explicit.current = false;
    inFlight.current = false;
    setDocument(authoritative);
    setPersistedDocument(authoritative);
    setRevision(draft.revision);
    setIsSaving(false);
    setFailureCode(null);
    setReloadError(false);
    setCopyFeedback(null);
    setStatus("saved");
  };
  const reloadDraft = async () => {
    if (!mounted.current || !blocked.current || inFlight.current || reloading.current) return;
    clearTimer();
    reloading.current = true;
    setIsReloading(true);
    setReloadError(false);
    let result: AutosaveReloadResult;
    try {
      result = await reloadRef.current();
    } catch {
      result = { ok: false };
    }
    if (!mounted.current) return;
    reloading.current = false;
    setIsReloading(false);
    if (!result.ok) {
      setReloadError(true);
      setStatus("conflict");
      return;
    }
    const authoritative = requireV3(result.draft);
    latest.current = authoritative;
    persisted.current = authoritative;
    baseRevision.current = result.draft.revision;
    blocked.current = false;
    explicit.current = false;
    setDocument(authoritative);
    setPersistedDocument(authoritative);
    setRevision(result.draft.revision);
    setFailureCode(null);
    setReloadError(false);
    setCopyFeedback(null);
    setStatus("saved");
  };
  const copyUnsaved = async () => {
    if (!mounted.current || !blocked.current || copying.current) return;
    copying.current = true;
    setIsCopying(true);
    setCopyFeedback(null);
    try {
      await navigator.clipboard.writeText(recoveryExport(latest.current));
      if (mounted.current) setCopyFeedback("copied");
    } catch {
      if (mounted.current) setCopyFeedback("failed");
    } finally {
      copying.current = false;
      if (mounted.current) setIsCopying(false);
    }
  };
  useEffect(
    () => () => {
      mounted.current = false;
      clearTimer();
    },
    [],
  );
  return {
    document,
    revision,
    status,
    isDirty: !equal(document, persistedDocument),
    isSaving,
    isReloading,
    isCopying,
    failureCode,
    reloadError,
    copyFeedback,
    onChange,
    adoptPersistedDraft,
    saveNow,
    reload: reloadDraft,
    copyUnsaved,
  };
}
