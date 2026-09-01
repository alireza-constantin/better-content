"use client";

import { useEffect } from "react";

import { useUnsavedChanges } from "@/components/navigation/unsaved-changes-provider";

export function useUnsavedContentDnaWarning(isDirty: boolean) {
  const reportDirtyState = useUnsavedChanges();

  useEffect(() => {
    reportDirtyState(isDirty);

    return () => reportDirtyState(false);
  }, [isDirty, reportDirtyState]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);
}
