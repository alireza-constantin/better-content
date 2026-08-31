// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import { ContentDnaEditor } from "./content-dna-editor";
import type { CurrentContentDnaDto } from "@/modules/dna/application";

const { save, load } = vi.hoisted(() => ({ save: vi.fn(), load: vi.fn() }));
vi.mock("@/modules/dna/application/save-content-dna-action", () => ({ saveContentDnaAction: save, loadCurrentContentDnaAction: load }));

const empty = { status: "NOT_CREATED", currentVersion: null } as const;
const current: CurrentContentDnaDto = { status: "INCOMPLETE", currentVersion: { id: "v1", versionNumber: 1, readiness: "INCOMPLETE", createdAt: new Date(), isCurrent: true, payload: { schemaVersion: 1, identity: { creatorOrBrandDescription: "Creator" }, expertise: { primaryTopics: ["One", "Two"] }, language: { defaultContentLanguage: "fa", contentLanguages: ["en", "fa"] } } } };
function renderEditor(locale = "en", data: CurrentContentDnaDto = empty) { return render(<NextIntlClientProvider locale={locale} messages={locale === "fa" ? fa : en}><ContentDnaEditor initialContentDna={data} workspaceId="workspace" /></NextIntlClientProvider>); }

describe("ContentDnaEditor", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });
  it("renders localized empty state and privacy notice", () => { renderEditor(); expect(screen.getByText("Start your Content DNA")).toBeTruthy(); expect(screen.getByText("Keep private information out")).toBeTruthy(); });
  it("hydrates current data and preserves content language independently of UI locale", () => { renderEditor("fa", current); expect(screen.getByDisplayValue("Creator")).toBeTruthy(); expect((screen.getByLabelText("انگلیسی") as HTMLInputElement).checked).toBe(true); expect((screen.getByLabelText("فارسی") as HTMLInputElement).checked).toBe(true); });
  it("tracks dirty state and supports priority add, movement, and boundary disabling", () => { renderEditor("en", current); expect((screen.getAllByRole("button", { name: /Move One up/ })[0] as HTMLButtonElement).disabled).toBe(true); fireEvent.click(screen.getAllByRole("button", { name: "Move Two up" })[0]); expect((screen.getAllByLabelText(/Primary topics/)[0] as HTMLInputElement).value).toBe("Two"); fireEvent.click(screen.getAllByText("Add")[0]); expect(screen.getByText("You have unsaved changes.")).toBeTruthy(); });
  it("keeps local edits and dirty state when saving conflicts", async () => { save.mockResolvedValueOnce({ ok: false, code: "CONFLICT" }); renderEditor(); fireEvent.change(screen.getByLabelText("Creator or brand description"), { target: { value: "Mine" } }); fireEvent.click(screen.getByRole("button", { name: "Save Content DNA" })); expect(await screen.findByText(/newer Content DNA version/)).toBeTruthy(); expect(screen.getByDisplayValue("Mine")).toBeTruthy(); expect(screen.getByText("You have unsaved changes.")).toBeTruthy(); });
});
