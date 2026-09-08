import { getServerSession } from "@/lib/auth/server";
import { getAssetLibrary } from "@/modules/assets/application";
import { AssetLibraryWorkspace } from "@/modules/assets/presentation/asset-library-workspace";
import { parseAssetLibraryUrlState } from "@/modules/assets/presentation/asset-library-url-state";
import { getOrCreateDefaultWorkspace } from "@/modules/workspace/application";

export default async function AssetsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{
    page?: string | string[];
    q?: string | string[];
    type?: string | string[];
    status?: string | string[];
  }>;
}>) {
  const [session, search] = await Promise.all([getServerSession(), searchParams]);
  if (!session) return null;
  const workspace = await getOrCreateDefaultWorkspace(session.user.id);
  const urlState = parseAssetLibraryUrlState(search);
  const library = await getAssetLibrary({ workspaceId: workspace.id, ...urlState });
  return (
    <AssetLibraryWorkspace
      workspaceId={workspace.id}
      initialLibrary={library}
      initialUrlState={urlState}
    />
  );
}
