import { Link, useNavigate } from "react-router";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Row } from "../components/Row";
import { Sphere } from "../components/Sphere";
import { t } from "../i18n";
import { typicalMinutes } from "../i18n/format";
import { getPlanSessions, plans } from "../mocks/data";
import styles from "./screens.module.css";

/** Primer uso: pide el micrófono. El permiso real llega en la historia de voz; aquí solo se avanza. */
export function FirstUse() {
  const navigate = useNavigate();
  return (
    <div className={styles.center}>
      <Sphere />
      <div>
        <h1 className={styles.talkTitle}>{t("activation.firstTitle")}</h1>
        <p className={styles.lead}>{t("activation.firstBody")}</p>
      </div>
      <div className={styles.stack} style={{ width: "100%" }}>
        <Button onClick={() => navigate("/entrevista")}>{t("activation.allowMic")}</Button>
        <Link to="/yo/ajustes/privacidad" style={{ color: "var(--c-accent)", minHeight: "var(--tap)", display: "flex", alignItems: "center", justifyContent: "center", font: "var(--fw-semibold) var(--fs-body)/1 var(--font)" }}>
          {t("activation.howWeCare")}
        </Link>
      </div>
    </div>
  );
}

/** Planes propuestos al terminar la entrevista: quedan los dos activos. */
export function ProposedPlans() {
  const navigate = useNavigate();
  return (
    <div className={styles.stackLoose}>
      <h1 className={styles.title}>{t("activation.proposedTitle")}</h1>
      <div className={styles.stack}>
        {plans.map((plan) => {
          const minutes = typicalMinutes(getPlanSessions(plan.id).map((s) => s.suggestedMinutes));
          return (
            <Card key={plan.id}>
              <div className={styles.stack}>
                <Row title={plan.name} subtitle={t("plans.sessionsCount", { n: plan.sessionsTotal, minutes })} chevron={false} />
                <Button onClick={() => navigate(`/planes/${plan.id}`, { replace: true })} aria-label={`${t("activation.start")}: ${plan.name}`}>
                  {t("activation.start")}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
      <p className={styles.small}>{t("activation.bothActive")}</p>
    </div>
  );
}
