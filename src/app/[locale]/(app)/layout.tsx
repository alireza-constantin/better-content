import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { ApplicationShell } from "@/components/shell/application-shell";
import { isAppLocale } from "@/i18n/routing";
import { getServerSession } from "@/lib/auth/server";
import { getOrCreateDefaultWorkspace } from "@/modules/workspace/application";

type ProtectedApplicationLayoutProps = Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>;

export default async function ProtectedApplicationLayout({
  children,
  params,
}: ProtectedApplicationLayoutProps) {
  const { locale } = await params;

  if (!isAppLocale(locale)) {
    notFound();
  }

  const session = await getServerSession();

  if (!session) {
    redirect(`/${locale}/sign-in`);
  }

  const [t] = await Promise.all([
    getTranslations({ locale, namespace: "ApplicationShell" }),
    getOrCreateDefaultWorkspace(session.user.id),
  ]);

  return (
    <ApplicationShell
      dashboardLabel={t("dashboard")}
      contentDnaLabel={t("contentDna")}
      ideasLabel={t("ideas")}
      productName={t("productName")}
      skipToContentLabel={t("skipToContent")}
      userEmail={session.user.email}
      userName={session.user.name}
      workspaceLabel={t("workspace")}
      workspaceContext={t("personalWorkspace")}
    >
      {children}
    </ApplicationShell>
  );
}
