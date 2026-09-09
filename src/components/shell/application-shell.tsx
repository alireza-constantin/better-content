import { Link } from "@/i18n/navigation";
import type { ReactNode } from "react";

import { UnsavedChangesProvider } from "../navigation/unsaved-changes-provider";
import {
  ApplicationNavigation,
  MobileApplicationMenu,
  MobileBottomNavigation,
} from "./application-navigation";
import { LocaleSwitcher } from "./locale-switcher";
import { SignOutButton } from "../auth/sign-out-button";

type ApplicationShellProps = Readonly<{
  children: ReactNode;
  productName: string;
  skipToContentLabel: string;
  dashboardLabel: string;
  contentDnaLabel: string;
  ideasLabel: string;
  menuLabel: string;
  contentLabel: string;
  assetsLabel: string;
  closeMenuLabel: string;
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
  menuLabel,
  contentLabel,
  assetsLabel,
  closeMenuLabel,
  workspaceLabel,
  userName,
  userEmail,
  workspaceContext,
}: ApplicationShellProps) {
  const navigationItems = [
    { href: "/dashboard" as const, label: dashboardLabel },
    { href: "/content-dna" as const, label: contentDnaLabel },
    { href: "/ideas" as const, label: ideasLabel },
    { href: "/content" as const, label: contentLabel },
    { href: "/assets" as const, label: assetsLabel },
  ];

  return (
    <UnsavedChangesProvider>
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-4 py-4 sm:px-8 sm:py-7">
        <a
          className="sr-only rounded-md bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm focus:not-sr-only focus:absolute focus:inset-x-5 focus:top-4 focus:z-10 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          href="#main-content"
        >
          {skipToContentLabel}
        </a>
        <header className="flex items-center justify-between gap-4 border-b border-border pb-4 sm:pb-5">
          <div className="min-w-0">
            <Link
              className="block truncate text-sm font-semibold tracking-[0.12em] text-foreground uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              href="/dashboard"
            >
              {productName}
            </Link>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              <span className="font-medium text-foreground/75">{workspaceLabel}</span>
              <span aria-hidden="true"> · </span>
              {workspaceContext}
            </p>
          </div>

          <div className="hidden shrink-0 items-center gap-2 sm:gap-3 lg:flex">
            <LocaleSwitcher />
            <SignOutButton userName={userName || userEmail} />
          </div>
          <div className="lg:hidden">
            <MobileApplicationMenu
              assetsLabel={assetsLabel}
              closeMenuLabel={closeMenuLabel}
              contentDnaLabel={contentDnaLabel}
              menuLabel={menuLabel}
              trigger="header"
              userName={userName || userEmail}
            />
          </div>
        </header>

        <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[12.5rem_minmax(0,1fr)] lg:gap-10">
          <ApplicationNavigation ariaLabel={dashboardLabel} items={navigationItems} />
          <main
            className="min-w-0 flex-1 py-7 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:py-9 sm:pb-[calc(6rem+env(safe-area-inset-bottom))] lg:py-10"
            id="main-content"
            tabIndex={-1}
          >
            {children}
          </main>
        </div>
        <MobileBottomNavigation
          assetsLabel={assetsLabel}
          closeMenuLabel={closeMenuLabel}
          contentDnaLabel={contentDnaLabel}
          items={navigationItems}
          menuLabel={menuLabel}
          userName={userName || userEmail}
        />
      </div>
    </UnsavedChangesProvider>
  );
}
