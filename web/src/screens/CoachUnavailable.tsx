import { useNavigate } from "react-router";
import { useCoach } from "../app/coach";
import { useReturnToOrigin } from "../app/navigation";
import { Button } from "../components/Button";
import { CircleButton } from "../components/CircleButton";
import { Sphere } from "../components/Sphere";
import { t } from "../i18n";
import { formatLongDate } from "../i18n/format";
import styles from "./screens.module.css";

/** «Coach no disponible»: sin conexión o bolsón agotado. La ✕ vuelve a la pantalla de origen. */
export function CoachUnavailable() {
  const { online, quota } = useCoach();
  const renewsOn = online ? quota?.renewsOn : null; // con conexión y bolsón agotado; si no, se explica la falta de conexión
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
          <h1 className={styles.talkTitle}>{renewsOn ? t("coachUnavailable.quotaTitle", { date: formatLongDate(renewsOn) }) : t("coachUnavailable.offlineTitle")}</h1>
          <p className={styles.lead}>{renewsOn ? t("coachUnavailable.quotaBody") : t("coachUnavailable.offlineBody")}</p>
        </div>
        <Button variant="secondary" onClick={() => navigate("/planes")}>{t("coachUnavailable.goToMeditations")}</Button>
      </div>
    </div>
  );
}
