// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Link from "next/link";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { useState } from "react";

import en from "../../../messages/en.json";
import fa from "../../../messages/fa.json";
import { useUnsavedContentDnaWarning } from "@/modules/dna/presentation/use-unsaved-content-dna-warning";

import { UnsavedChangesProvider } from "./unsaved-changes-provider";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

function NavigationFixture({
  dirty,
  onHistory,
  onLocale,
}: Readonly<{ dirty: boolean; onHistory: () => void; onLocale: () => void }>) {
  const t = useTranslations("ContentDna");
  const [value, setValue] = useState("");

  useUnsavedContentDnaWarning(dirty);

  return (
    <>
      <input
        aria-label="Local form value"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <p role="status">{dirty ? t("unsaved") : t("saved")}</p>
      <Link
        href="/content-dna/history"
        onClick={(event) => {
          event.preventDefault();
          onHistory();
        }}
      >
        History
      </Link>
      <Link
        href="/fa/content-dna"
        onClick={(event) => {
          event.preventDefault();
          onLocale();
        }}
      >
        فارسی
      </Link>
    </>
  );
}

function renderGuard(
  locale: "en" | "fa",
  dirty: boolean,
  callbacks: Readonly<{ onHistory?: () => void; onLocale?: () => void }> = {},
) {
  const user = userEvent.setup();
  const onHistory = callbacks.onHistory ?? vi.fn();
  const onLocale = callbacks.onLocale ?? vi.fn();

  render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fa}>
      <UnsavedChangesProvider>
        <NavigationFixture dirty={dirty} onHistory={onHistory} onLocale={onLocale} />
      </UnsavedChangesProvider>
    </NextIntlClientProvider>,
  );

  return { user, onHistory, onLocale, field: screen.getByLabelText("Local form value") };
}

describe("UnsavedChangesProvider", () => {
  afterEach(cleanup);

  it("blocks dirty history navigation and preserves local values after cancel", async () => {
    const { user, onHistory, field } = renderGuard("en", true);

    await user.type(field, "keep this value");
    await user.click(screen.getByRole("link", { name: "History" }));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Stay on this page" }));

    expect(onHistory).not.toHaveBeenCalled();
    expect((field as HTMLInputElement).value).toBe("keep this value");
    expect(screen.getByRole("status").textContent).toBe("You have unsaved changes.");
  });

  it("allows dirty history navigation after confirmation", async () => {
    const { user, onHistory } = renderGuard("en", true);

    await user.click(screen.getByRole("link", { name: "History" }));
    await user.click(await screen.findByRole("button", { name: "Leave without saving" }));

    expect(onHistory).toHaveBeenCalledTimes(1);
  });

  it("blocks dirty locale navigation and preserves local values after cancel", async () => {
    const { user, onLocale, field } = renderGuard("en", true);

    await user.type(field, "keep this locale value");
    await user.click(screen.getByRole("link", { name: "فارسی" }));
    await user.click(await screen.findByRole("button", { name: "Stay on this page" }));

    expect(onLocale).not.toHaveBeenCalled();
    expect((field as HTMLInputElement).value).toBe("keep this locale value");
    expect(screen.getByRole("status").textContent).toBe("You have unsaved changes.");
  });

  it("allows dirty locale navigation after confirmation", async () => {
    const { user, onLocale } = renderGuard("en", true);

    await user.click(screen.getByRole("link", { name: "فارسی" }));
    await user.click(await screen.findByRole("button", { name: "Leave without saving" }));

    expect(onLocale).toHaveBeenCalledTimes(1);
  });

  it("does not warn when the form is clean", async () => {
    const { user, onHistory } = renderGuard("en", false);

    await user.click(screen.getByRole("link", { name: "History" }));

    expect(onHistory).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("keeps browser before-unload protection for dirty forms", () => {
    renderGuard("en", true);
    const event = new Event("beforeunload", { cancelable: true });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it.each([
    {
      locale: "en" as const,
      title: "Leave with unsaved changes?",
      description: "Your changes have not been saved. If you leave this page, they will be lost.",
      cancel: "Stay on this page",
      confirm: "Leave without saving",
    },
    {
      locale: "fa" as const,
      title: "با تغییرات ذخیره‌نشده خارج شوید؟",
      description:
        "تغییرات شما ذخیره نشده‌اند. اگر از این صفحه خارج شوید، این تغییرات از بین می‌روند.",
      cancel: "ماندن در این صفحه",
      confirm: "خروج بدون ذخیره",
    },
  ])(
    "renders the dirty navigation warning in $locale",
    async ({ locale, title, description, cancel, confirm }) => {
      const { user } = renderGuard(locale, true);

      await user.click(screen.getByRole("link", { name: locale === "en" ? "History" : "فارسی" }));

      expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
      expect(screen.getByText(description)).toBeTruthy();
      expect(screen.getByRole("button", { name: cancel })).toBeTruthy();
      expect(screen.getByRole("button", { name: confirm })).toBeTruthy();
    },
  );
});
