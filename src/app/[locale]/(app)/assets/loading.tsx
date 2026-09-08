import { getTranslations } from "next-intl/server";

export default async function AssetsLoading() {
  const t = await getTranslations("AssetLibrary");
  return <p role="status">{t("loading")}</p>;
}
