import { notFound } from "next/navigation";

import { AuthScreen } from "@/components/auth/auth-screen";
import { isAppLocale } from "@/i18n/routing";

type SignUpPageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export default async function SignUpPage({ params }: SignUpPageProps) {
  const { locale } = await params;

  if (!isAppLocale(locale)) {
    notFound();
  }

  return <AuthScreen mode="sign-up" />;
}
