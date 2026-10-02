import { Link } from "react-router-dom";

import { useLanguage } from "@/i18n/useLanguage";
import { ROUTES } from "@/routes/paths";

import styles from "./NotFoundPage.module.scss";

export function NotFoundPage() {
  const { t } = useLanguage();

  return (
    <div className={styles.page}>
      <p className={styles.code}>{t("notFound.code")}</p>
      <h1 className={styles.title}>{t("notFound.title")}</h1>
      <p className={styles.message}>{t("notFound.message")}</p>
      <Link to={ROUTES.home}>{t("notFound.back")}</Link>
    </div>
  );
}
