import { useNavigate } from "react-router";
import { useDemo } from "../app/demo";
import { useReturnToOrigin } from "../app/navigation";
import { Button } from "../components/Button";
import { CircleButton } from "../components/CircleButton";
import { Sphere } from "../components/Sphere";
import { t } from "../i18n";
import { formatLongDate } from "../i18n/format";
import styles from "./screens.module.css";

/** «Coach no disponible»: sin conexión o bolsón agotado. La ✕ vuelve a la pantalla de origen. */
export function CoachUnavailable() {
  const { online, quota } = useDemo();
  const close = useReturnToOrigin("/");
  const navigate = useNavigate();
  return (
    <div className={styles.player}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <CircleButton icon="close" label={t("common.close")} onClick={close} />
      </div>
      <div className={styles.center}>
        <Sphere on={false} size={160} />
        <div>
          <h1 className={styles.talkTitle}>{online ? t("coachUnavailable.quotaTitle", { date: formatLongDate(quota.renewsOn ?? "") }) : t("coachUnavailable.offlineTitle")}</h1>
          <p className={styles.lead}>{online ? t("coachUnavailable.quotaBody") : t("coachUnavailable.offlineBody")}</p>
        </div>
        <Button variant="secondary" onClick={() => navigate("/planes")}>{t("coachUnavailable.goToMeditations")}</Button>
      </div>
    </div>
  );
}
