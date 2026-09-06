// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import type { ContentDocumentV2 } from "../domain";
import { BlockProductionDirections } from "./block-production-directions";

const document: ContentDocumentV2 = {
  schemaVersion: 2,
  script: {
    blocks: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        type: "paragraph",
        text: "Script",
        performanceDirections: [],
        editDirections: [],
      },
    ],
  },
};

function renderDirections(onChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <BlockProductionDirections
        block={document.script.blocks[0]}
        disabled={false}
        document={document}
        language="fa"
        onChange={onChange}
      />
    </NextIntlClientProvider>,
  );
  return onChange;
}

describe("BlockProductionDirections", () => {
  it("adds a compact Performance direction through the local document aggregate", () => {
    const onChange = renderDirections();
    fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(onChange).toHaveBeenCalledOnce();
    const next = onChange.mock.calls[0][0] as ContentDocumentV2;
    expect(next.script.blocks[0].performanceDirections[0]).toMatchObject({
      type: "PAUSE",
      duration: "short",
    });
  });

  it("uses content-language semantics for creator authored direction text", () => {
    renderDirections();
    fireEvent.click(screen.getAllByRole("button", { name: "Add" })[1]);
    fireEvent.change(screen.getByLabelText("Direction type"), { target: { value: "BROLL_CUE" } });
    const description = screen.getByLabelText("Description");
    expect(description.getAttribute("lang")).toBe("fa");
    expect(description.getAttribute("dir")).toBe("rtl");
  });
});
