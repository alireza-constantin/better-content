import { notFound } from "next/navigation";

import { AuthScreen } from "@/components/auth/auth-screen";
import { isAppLocale } from "@/i18n/routing";

type SignInPageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export default async function SignInPage({ params }: SignInPageProps) {
  const { locale } = await params;

  if (!isAppLocale(locale)) {
    notFound();
  }

  return <AuthScreen mode="sign-in" />;
}
