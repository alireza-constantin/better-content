import { Link } from "@/i18n/navigation";
import type { ReactNode } from "react";

import { UnsavedChangesProvider } from "../navigation/unsaved-changes-provider";
import { LocaleSwitcher } from "./locale-switcher";
import { SignOutButton } from "../auth/sign-out-button";

type ApplicationShellProps = Readonly<{
  children: ReactNode;
  productName: string;
  skipToContentLabel: string;
  dashboardLabel: string;
  contentDnaLabel: string;
  ideasLabel: string;
  contentLabel: string;
  workspaceLabel: string;
  userName: string;
  userEmail: string;
  workspaceContext: string;
}>;

export function ApplicationShell({
  children,
  productName,
  skipToContentLabel,
  dashboardLabel,
  contentDnaLabel,
  ideasLabel,
  contentLabel,
  workspaceLabel,
  userName,
  userEmail,
  workspaceContext,
}: ApplicationShellProps) {
  return (
    <UnsavedChangesProvider>
      <div className="mx-auto flex min-h-screen w-full max-w-[1360px] flex-col px-5 py-6 sm:px-8 sm:py-8">
        <a
          className="sr-only rounded-md bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm focus:not-sr-only focus:absolute focus:inset-x-5 focus:top-4 focus:z-10 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          href="#main-content"
        >
          {skipToContentLabel}
        </a>
        <header className="flex flex-col gap-5 border-b border-border pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <Link
              className="text-sm font-semibold tracking-[0.14em] text-foreground uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              href="/dashboard"
            >
              {productName}
            </Link>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{workspaceLabel}:</span>{" "}
              {workspaceContext}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <LocaleSwitcher />
            <SignOutButton userName={userName || userEmail} />
          </div>
        </header>

        <main className="flex flex-1 flex-col py-8 sm:py-12" id="main-content" tabIndex={-1}>
          <nav
            aria-label={dashboardLabel}
            className="mb-8 flex flex-wrap gap-x-4 gap-y-2 border-s-2 border-primary ps-4"
          >
            <Link
              className="text-sm font-medium text-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              href="/dashboard"
            >
              {dashboardLabel}
            </Link>
            <Link
              className="text-sm font-medium text-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              href="/content-dna"
            >
              {contentDnaLabel}
            </Link>
            <Link
              className="text-sm font-medium text-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              href="/ideas"
            >
              {ideasLabel}
            </Link>
            <Link
              className="text-sm font-medium text-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              href="/content"
            >
              {contentLabel}
            </Link>
          </nav>
          {children}
        </main>
      </div>
    </UnsavedChangesProvider>
  );
}
