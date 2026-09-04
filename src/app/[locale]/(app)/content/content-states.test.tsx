// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../../messages/en.json";
import fa from "../../../../../messages/fa.json";

const mocks = vi.hoisted(() => ({
  getTranslations: vi.fn(),
}));

vi.mock("next-intl/server", () => ({ getTranslations: mocks.getTranslations }));

import ContentError from "./error";
import ContentLoading from "./loading";

beforeEach(() => {
  mocks.getTranslations.mockResolvedValue((key: string) => key);
});

afterEach(cleanup);

describe("Content route states", () => {
  it("renders an accessible localized loading boundary with shadcn skeletons", async () => {
    const result = await ContentLoading();
    const view = render(result);

    expect(screen.getByRole("heading", { name: "loadingTitle" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("loadingDescription");
    expect(screen.getByRole("region").getAttribute("aria-busy")).toBe("true");
    expect(view.container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(4);
  });

  it.each([
    {
      locale: "en" as const,
      messages: en,
      title: "Content could not be loaded",
      retry: "Try again",
    },
    { locale: "fa" as const, messages: fa, title: "محتوا بارگذاری نشد", retry: "تلاش دوباره" },
  ])(
    "renders a localized error boundary with an accessible retry",
    ({ locale, messages, title, retry }) => {
      const reset = vi.fn();
      render(
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ContentError reset={reset} />
        </NextIntlClientProvider>,
      );

      expect(screen.getByRole("alert").getAttribute("aria-live")).toBe("assertive");
      expect(screen.getByText(title)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: retry }));
      expect(reset).toHaveBeenCalledOnce();
    },
  );
});
