"use client";

import { useTranslations } from "next-intl";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogBackdrop,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogViewport,
} from "@/components/ui/alert-dialog";

type UnsavedChangesContextValue = (isDirty: boolean) => void;

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

function isSameDocumentLocation(destination: URL): boolean {
  return (
    destination.pathname === window.location.pathname &&
    destination.search === window.location.search &&
    destination.hash === window.location.hash
  );
}

export function UnsavedChangesProvider({ children }: Readonly<{ children: ReactNode }>) {
  const t = useTranslations("ContentDna");
  const [isDirty, setIsDirty] = useState(false);
  const [pendingAnchor, setPendingAnchor] = useState<HTMLAnchorElement | null>(null);
  const pendingAnchorRef = useRef<HTMLAnchorElement | null>(null);
  const bypassGuardRef = useRef(false);

  const reportDirtyState = useCallback((dirty: boolean) => {
    setIsDirty(dirty);
  }, []);

  const clearPendingNavigation = useCallback(() => {
    pendingAnchorRef.current = null;
    setPendingAnchor(null);
  }, []);

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const handleDocumentClick = (event: MouseEvent) => {
      if (
        bypassGuardRef.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      if (!(event.target instanceof Element)) {
        return;
      }

      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");

      if (
        !anchor ||
        !document.documentElement.contains(anchor) ||
        (anchor.target && anchor.target !== "_self") ||
        anchor.hasAttribute("download")
      ) {
        return;
      }

      const destination = new URL(anchor.href, window.location.href);

      if (
        destination.origin !== window.location.origin ||
        isSameDocumentLocation(destination) ||
        pendingAnchorRef.current
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      pendingAnchorRef.current = anchor;
      setPendingAnchor(anchor);
    };

    document.addEventListener("click", handleDocumentClick, true);

    return () => document.removeEventListener("click", handleDocumentClick, true);
  }, [isDirty]);

  const handleConfirmNavigation = () => {
    const anchor = pendingAnchorRef.current;

    if (!anchor) {
      return;
    }

    clearPendingNavigation();
    bypassGuardRef.current = true;
    anchor.click();
    bypassGuardRef.current = false;
  };

  return (
    <UnsavedChangesContext.Provider value={reportDirtyState}>
      {children}
      <AlertDialog
        open={pendingAnchor !== null}
        onOpenChange={(open) => {
          if (!open) {
            clearPendingNavigation();
          }
        }}
      >
        <AlertDialogPortal>
          <AlertDialogBackdrop />
          <AlertDialogViewport>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("unsavedNavigationTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("unsavedNavigationDescription")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("unsavedNavigationCancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleConfirmNavigation}>
                  {t("unsavedNavigationConfirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialogViewport>
        </AlertDialogPortal>
      </AlertDialog>
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges() {
  const context = useContext(UnsavedChangesContext);

  if (!context) {
    throw new Error("useUnsavedChanges must be used inside UnsavedChangesProvider.");
  }

  return context;
}
