import { useNavigate } from "react-router";
import { useDemo } from "../app/demo";
import { useGoWithOrigin } from "../app/navigation";
import { Button } from "../components/Button";
import { Sphere } from "../components/Sphere";
import { t } from "../i18n";
import { formatLongDate } from "../i18n/format";
import styles from "./screens.module.css";

export function Home() {
  const { coachAvailable, online, quota } = useDemo();
  const go = useGoWithOrigin();
  const navigate = useNavigate();

  const title = coachAvailable ? t("home.title") : t("home.titleNoCoach");
  const subtitle = coachAvailable
    ? t("home.subtitle")
    : !online
      ? t("home.needsInternet")
      : t("home.coachReturns", { date: formatLongDate(quota.renewsOn ?? "") });


  return (
    <div className={styles.center}>
      <div>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.lead}>{subtitle}</p>
      </div>
      <button type="button" className={styles.sphereBtn} aria-label={t("home.tapToTalk")} onClick={() => go(coachAvailable ? "/charla" : "/sin-coach")}>
        <Sphere on={coachAvailable} />
        <span className={styles.sphereLabel}>{t("home.tapToTalk")}</span>
      </button>
      {/* Con coach: contorno. Sin coach (sin bolsón o sin conexión): relleno, es la acción principal. */}
      <Button variant={coachAvailable ? "secondary" : "primary"} onClick={() => navigate("/planes")}>
        {t("home.startMeditation")}
      </Button>
    </div>
  );
}
