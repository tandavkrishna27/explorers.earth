import { useTranslation } from "react-i18next";
import EarthLoader from "./EarthLoader";

/** GL-02: the only globe in the signed-in app, shown while the app boots. Everything else uses skeletons. */
export function BootSplash({ overlay = false }: { overlay?: boolean }) {
  const { t } = useTranslation();
  const loader = <EarthLoader context="general" size="default" statusMessage={t("dashboard.wp1.loader.boot")} />;
  return overlay ? (
    <div data-loader-owner="boot" className="fixed inset-0 z-[9999] flex items-center justify-center bg-dashboard-bg">{loader}</div>
  ) : (
    <div data-loader-owner="boot">{loader}</div>
  );
}

export default BootSplash;
