"use client";

import {
  FileText,
  FolderArchive,
  LayoutDashboard,
  Lightbulb,
  Menu,
  Settings2,
  X,
  type LucideIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useLocale } from "next-intl";
import { useState } from "react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  DialogViewport,
} from "@/components/ui/dialog";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

import { LocaleSwitcher } from "./locale-switcher";

type NavigationItem = Readonly<{
  href: "/dashboard" | "/content-dna" | "/ideas" | "/content" | "/assets";
  label: string;
}>;

type ApplicationNavigationProps = Readonly<{
  ariaLabel: string;
  items: readonly NavigationItem[];
}>;

type MobileApplicationMenuProps = Readonly<{
  assetsLabel: string;
  closeMenuLabel: string;
  contentDnaLabel: string;
  menuLabel: string;
  userName: string;
  trigger: "header" | "bottom";
}>;

const primaryNavigation = [
  { href: "/dashboard" as const, icon: LayoutDashboard },
  { href: "/ideas" as const, icon: Lightbulb },
  { href: "/content" as const, icon: FileText },
];

export function ApplicationNavigation({ ariaLabel, items }: ApplicationNavigationProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label={ariaLabel}
      className="hidden lg:block lg:border-e lg:border-border lg:py-10 lg:pe-6"
    >
      <ul className="flex flex-col items-stretch gap-1">
        {items.map((item) => {
          const isCurrent = pathname === item.href;

          return (
            <li key={item.href}>
              <Link
                aria-current={isCurrent ? "page" : undefined}
                className={cn(
                  "flex min-h-11 w-full items-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isCurrent
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                href={item.href}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function MobileApplicationMenu({
  assetsLabel,
  closeMenuLabel,
  contentDnaLabel,
  menuLabel,
  userName,
  trigger,
}: MobileApplicationMenuProps) {
  const [open, setOpen] = useState(false);
  const locale = useLocale();
  const prefersReducedMotion = useReducedMotion();
  const slideFrom = locale === "fa" ? -20 : 20;
  const isHeaderTrigger = trigger === "header";

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        aria-label={menuLabel}
        className={cn(
          "inline-flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          isHeaderTrigger
            ? "size-11"
            : "min-h-14 w-full flex-col gap-0.5 text-[0.6875rem] font-medium",
        )}
      >
        <Menu aria-hidden="true" className="size-5" />
        {isHeaderTrigger ? <span className="sr-only">{menuLabel}</span> : <span>{menuLabel}</span>}
      </DialogTrigger>
      <DialogPortal>
        <DialogBackdrop />
        <DialogViewport className="items-stretch justify-end p-0">
          <DialogContent className="h-full max-h-none w-[min(20rem,calc(100vw-2rem))] max-w-none rounded-none border-0 border-s border-border p-0 shadow-2xl">
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              className="flex h-full flex-col"
              initial={prefersReducedMotion ? false : { opacity: 0, x: slideFrom }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <DialogTitle className="text-base font-semibold tracking-tight">
                  {menuLabel}
                </DialogTitle>
                <DialogClose
                  aria-label={closeMenuLabel}
                  className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <X aria-hidden="true" className="size-5" />
                </DialogClose>
              </div>

              <nav aria-label={menuLabel} className="px-3 py-4">
                <ul className="space-y-1">
                  <MobileMenuLink
                    href="/content-dna"
                    icon={Settings2}
                    label={contentDnaLabel}
                    onNavigate={() => setOpen(false)}
                  />
                  <MobileMenuLink
                    href="/assets"
                    icon={FolderArchive}
                    label={assetsLabel}
                    onNavigate={() => setOpen(false)}
                  />
                </ul>
              </nav>

              <div className="mt-auto border-t border-border px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                <div className="flex items-center justify-between gap-4">
                  <LocaleSwitcher />
                  <SignOutButton userName={userName} />
                </div>
              </div>
            </motion.div>
          </DialogContent>
        </DialogViewport>
      </DialogPortal>
    </Dialog>
  );
}

export function MobileBottomNavigation({
  assetsLabel,
  closeMenuLabel,
  contentDnaLabel,
  items,
  menuLabel,
  userName,
}: Readonly<{
  assetsLabel: string;
  closeMenuLabel: string;
  contentDnaLabel: string;
  items: readonly NavigationItem[];
  menuLabel: string;
  userName: string;
}>) {
  const pathname = usePathname();
  const primaryItems = primaryNavigation.map((primary) => ({
    ...primary,
    label: items.find((item) => item.href === primary.href)?.label ?? "",
  }));
  const isSecondaryCurrent = pathname === "/content-dna" || pathname === "/assets";

  return (
    <nav
      aria-label={items[0]?.label}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-2 pt-1 backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-4 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {primaryItems.map((item) => {
          const isCurrent = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              aria-current={isCurrent ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-md text-[0.6875rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isCurrent
                  ? "text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              href={item.href}
              key={item.href}
            >
              <Icon aria-hidden="true" className="size-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <div className={cn(isSecondaryCurrent && "text-foreground")}>
          <MobileApplicationMenu
            assetsLabel={assetsLabel}
            closeMenuLabel={closeMenuLabel}
            contentDnaLabel={contentDnaLabel}
            menuLabel={menuLabel}
            trigger="bottom"
            userName={userName}
          />
        </div>
      </div>
    </nav>
  );
}

function MobileMenuLink({
  href,
  icon: Icon,
  label,
  onNavigate,
}: Readonly<{
  href: "/content-dna" | "/assets";
  icon: LucideIcon;
  label: string;
  onNavigate: () => void;
}>) {
  return (
    <li>
      <Link
        className="flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        href={href}
        onClick={onNavigate}
      >
        <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
        {label}
      </Link>
    </li>
  );
}
