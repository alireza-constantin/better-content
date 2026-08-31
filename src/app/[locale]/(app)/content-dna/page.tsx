import { getTranslations } from "next-intl/server";

import { ContentDnaEditor } from "@/modules/dna/presentation/content-dna-editor";
import { getServerSession } from "@/lib/auth/server";
import { getCurrentContentDna } from "@/modules/dna/application";
import { getOrCreateDefaultWorkspace } from "@/modules/workspace/application";

export default async function ContentDnaPage() {
  const session = await getServerSession();

  // The protected layout guarantees this, while retaining a narrow server-only route boundary.
  if (!session) {
    return null;
  }

  const workspace = await getOrCreateDefaultWorkspace(session.user.id);
  const [current, t] = await Promise.all([
    getCurrentContentDna({ workspaceId: workspace.id }),
    getTranslations("ContentDna"),
  ]);

  return (
    <section className="max-w-3xl">
      <p className="text-sm font-medium tracking-wide text-muted-foreground">{t("eyebrow")}</p>
      <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
        {t("title")}
      </h1>
      <p className="mt-5 max-w-2xl leading-7 text-muted-foreground">{t("description")}</p>
      <ContentDnaEditor initialContentDna={current} workspaceId={workspace.id} />
    </section>
  );
}
