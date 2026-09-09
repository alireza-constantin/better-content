// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CONTENT_DRAFT_AUTOSAVE_DEBOUNCE_MS,
  type AutosaveSaveResult,
  useContentDraftAutosave,
} from "./use-content-draft-autosave";
import { projectContentDocumentV2ToV3 } from "../domain";

const document = (text: string) => ({
  schemaVersion: 2 as const,
  script: {
    blocks: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        type: "paragraph" as const,
        text,
        performanceDirections: [],
        editDirections: [],
      },
    ],
  },
});
const draft = (revision: number, text: string) => ({
  document: document(text),
  editorDocument: projectContentDocumentV2ToV3(document(text)),
  v2Projection: document(text),
  revision,
  updatedAt: new Date(),
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe("useContentDraftAutosave", () => {
  it("flushes a dirty document immediately when Save now is requested", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue({ ok: true, draft: draft(2, "Changed") });
    const { result } = renderHook(() =>
      useContentDraftAutosave({
        workspaceId: "w",
        contentId: "c",
        initialDocument: document("Initial"),
        initialRevision: 1,
        save,
        reload: async () => ({ ok: true as const, draft: draft(2, "Server") }),
      }),
    );

    act(() => result.current.onChange(document("Changed")));
    expect(result.current.status).toBe("unsaved");

    act(() => result.current.saveNow());

    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith({
      workspaceId: "w",
      contentId: "c",
      baseRevision: 1,
      document: document("Changed"),
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe("saved");
    expect(result.current.isDirty).toBe(false);
    vi.useRealTimers();
  });

  it("starts a projected V2 document clean and coalesces a later complete document", async () => {
    vi.useFakeTimers();
    const first = deferred<AutosaveSaveResult>();
    const second = deferred<AutosaveSaveResult>();
    const save = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() =>
      useContentDraftAutosave({
        workspaceId: "w",
        contentId: "c",
        initialDocument: document("Initial"),
        initialRevision: 4,
        save,
        reload: async () => ({ ok: true as const, draft: draft(9, "Server") }),
      }),
    );
    expect(result.current.isDirty).toBe(false);
    act(() => result.current.onChange(document("A")));
    act(() => vi.advanceTimersByTime(CONTENT_DRAFT_AUTOSAVE_DEBOUNCE_MS));
    expect(save).toHaveBeenCalledOnce();
    act(() => result.current.onChange(document("B")));
    await act(async () => {
      first.resolve({ ok: true, draft: draft(5, "A") });
      await first.promise;
    });
    expect(save.mock.calls[1][0]).toMatchObject({ baseRevision: 5, document: document("B") });
    await act(async () => {
      second.resolve({ ok: true, draft: draft(6, "B") });
      await second.promise;
    });
    expect(result.current.document.script.blocks[0].text).toBe("B");
    vi.useRealTimers();
  });
  it("stops on conflicts and copies the human recovery export", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const save = vi.fn().mockResolvedValue({ ok: false, code: "CONFLICT" });
    const { result } = renderHook(() =>
      useContentDraftAutosave({
        workspaceId: "w",
        contentId: "c",
        initialDocument: document("Initial"),
        initialRevision: 1,
        save,
        reload: async () => ({ ok: true as const, draft: draft(2, "Server") }),
      }),
    );
    act(() => result.current.onChange(document("Local")));
    act(() => vi.advanceTimersByTime(CONTENT_DRAFT_AUTOSAVE_DEBOUNCE_MS));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.status).toBe("conflict");
    await act(async () => {
      await result.current.copyUnsaved();
    });
    expect(writeText).toHaveBeenCalledWith("Script\nLocal");
    vi.useRealTimers();
  });
});
