// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CONTENT_DRAFT_AUTOSAVE_DEBOUNCE_MS,
  useContentDraftAutosave,
  type AutosaveReloadResult,
  type AutosaveSaveResult,
} from "./use-content-draft-autosave";

const initialDocument = { schemaVersion: 1 as const, script: { text: "Initial" } };

function draft(revision: number, text: string) {
  return {
    document: { schemaVersion: 1 as const, script: { text } },
    revision,
    updatedAt: new Date("2026-09-01T10:00:00.000Z"),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function renderAutosave(
  save: (
    input: Parameters<NonNullable<Parameters<typeof useContentDraftAutosave>[0]["save"]>>[0],
  ) => Promise<AutosaveSaveResult>,
  reload: () => Promise<AutosaveReloadResult> = async () => ({
    ok: true,
    draft: draft(1, "Initial"),
  }),
) {
  return renderHook(() =>
    useContentDraftAutosave({
      workspaceId: "workspace-id",
      contentId: "content-id",
      initialDocument,
      initialRevision: 1,
      save,
      reload,
    }),
  );
}

describe("useContentDraftAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("hydrates the exact document and revision, then debounces within the approved window", () => {
    const pending = deferred<AutosaveSaveResult>();
    const save = vi.fn().mockReturnValue(pending.promise);
    const { result } = renderAutosave(save);

    expect(result.current.text).toBe("Initial");
    expect(result.current.revision).toBe(1);
    expect(result.current.status).toBe("saved");

    act(() => result.current.onChange("A"));
    expect(result.current.status).toBe("unsaved");

    act(() => vi.advanceTimersByTime(CONTENT_DRAFT_AUTOSAVE_DEBOUNCE_MS - 1));
    expect(save).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0]?.[0]).toMatchObject({
      workspaceId: "workspace-id",
      contentId: "content-id",
      baseRevision: 1,
      document: { schemaVersion: 1, script: { text: "A" } },
    });
    expect(result.current.status).toBe("saving");
  });

  it("keeps exactly one request active and coalesces rapid edits to the latest text", async () => {
    const first = deferred<AutosaveSaveResult>();
    const second = deferred<AutosaveSaveResult>();
    const save = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderAutosave(save);

    act(() => result.current.onChange("A"));
    act(() => vi.advanceTimersByTime(CONTENT_DRAFT_AUTOSAVE_DEBOUNCE_MS));
    expect(save).toHaveBeenCalledOnce();

    act(() => result.current.onChange("B"));
    act(() => result.current.onChange("C"));
    act(() => result.current.onChange("D"));
    act(() => vi.advanceTimersByTime(CONTENT_DRAFT_AUTOSAVE_DEBOUNCE_MS * 2));
    expect(save).toHaveBeenCalledOnce();

    await act(async () => {
      first.resolve({ ok: true, draft: draft(2, "A") });
      await first.promise;
    });

    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[0]).toMatchObject({
      baseRevision: 2,
      document: { script: { text: "D" } },
    });
    expect(save.mock.calls[1]?.[0]).not.toMatchObject({ document: { script: { text: "B" } } });
    expect(save.mock.calls[1]?.[0]).not.toMatchObject({ document: { script: { text: "C" } } });

    await act(async () => {
      second.resolve({ ok: true, draft: draft(3, "D") });
      await second.promise;
    });

    expect(result.current.text).toBe("D");
    expect(result.current.revision).toBe(3);
    expect(result.current.status).toBe("saved");
    expect(result.current.isDirty).toBe(false);
  });

  it("advances the revision on success and preserves local text on failure until explicit retry", async () => {
    const save = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, draft: draft(2, "Saved") })
      .mockResolvedValueOnce({ ok: false, code: "INTERNAL_ERROR" as const })
      .mockResolvedValueOnce({ ok: true, draft: draft(3, "Latest local") });
    const { result } = renderAutosave(save);

    act(() => result.current.onChange("Saved"));
    act(() => vi.advanceTimersByTime(CONTENT_DRAFT_AUTOSAVE_DEBOUNCE_MS));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.status).toBe("saved");
    expect(result.current.revision).toBe(2);

    act(() => result.current.onChange("Latest local"));
    act(() => vi.advanceTimersByTime(CONTENT_DRAFT_AUTOSAVE_DEBOUNCE_MS));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.status).toBe("failed");
    expect(result.current.text).toBe("Latest local");
    expect(result.current.isDirty).toBe(true);

    act(() => vi.advanceTimersByTime(CONTENT_DRAFT_AUTOSAVE_DEBOUNCE_MS * 3));
    expect(save).toHaveBeenCalledTimes(2);

    act(() => result.current.saveNow());
    await act(async () => {
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(3);
    expect(save.mock.calls[2]?.[0]).toMatchObject({
      baseRevision: 2,
      document: { script: { text: "Latest local" } },
    });
    expect(result.current.status).toBe("saved");
    expect(result.current.revision).toBe(3);
  });

  it("stops on conflict, retains local text, and only replaces it after explicit reload", async () => {
    const save = vi.fn().mockResolvedValue({ ok: false, code: "CONFLICT" as const });
    const reload = vi.fn().mockResolvedValue({ ok: true, draft: draft(4, "Authoritative") });
    const { result } = renderAutosave(save, reload);

    act(() => result.current.onChange("Local unsaved"));
    act(() => vi.advanceTimersByTime(CONTENT_DRAFT_AUTOSAVE_DEBOUNCE_MS));
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe("conflict");
    expect(result.current.text).toBe("Local unsaved");
    expect(result.current.isDirty).toBe(true);

    act(() => result.current.onChange("Still local"));
    act(() => vi.advanceTimersByTime(CONTENT_DRAFT_AUTOSAVE_DEBOUNCE_MS * 2));
    expect(save).toHaveBeenCalledOnce();

    await act(async () => {
      await result.current.reload();
    });
    expect(reload).toHaveBeenCalledOnce();
    expect(result.current.text).toBe("Authoritative");
    expect(result.current.revision).toBe(4);
    expect(result.current.status).toBe("saved");
    expect(result.current.isDirty).toBe(false);
  });

  it("preserves text when clipboard access fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard denied"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const save = vi.fn().mockResolvedValue({ ok: false, code: "CONFLICT" as const });
    const { result } = renderAutosave(save);

    act(() => result.current.onChange("Keep this"));
    act(() => vi.advanceTimersByTime(CONTENT_DRAFT_AUTOSAVE_DEBOUNCE_MS));
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await result.current.copyUnsaved();
    });

    expect(writeText).toHaveBeenCalledWith("Keep this");
    expect(result.current.text).toBe("Keep this");
    expect(result.current.copyFeedback).toBe("failed");
  });
});
