import { Navigate, useNavigate, useParams } from "react-router";
import { useGoWithOrigin } from "../app/navigation";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Icon } from "../components/Icon";
import { t } from "../i18n";
import { nextSessionOf, planById, sessionsOf, usePlansState } from "../data/plans";
import styles from "./screens.module.css";

export function PlanDetail() {
  const { planId = "" } = useParams();
  const navigate = useNavigate();
  const go = useGoWithOrigin();
  const state = usePlansState();
  const plan = planById(state, planId);
  if (!plan) return <Navigate to="/planes" replace />;

  const sessions = sessionsOf(state, plan.id);
  const next = nextSessionOf(state, plan.id);
  const completed = plan.status === "completado";

  return (
    <div className={styles.stackLoose}>
      <div>
        <h1 className={styles.title}>{plan.name}</h1>
        <p className={styles.lead}>
          {completed
            ? t("planDetail.completedProgress", { total: plan.sessionsTotal })
            : t("planDetail.progress", { current: plan.sessionsDone + 1, total: plan.sessionsTotal })}
        </p>
      </div>
      <ol className={styles.stack} style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label={t("plans.sessionsAria")}>
        {sessions.map((s) => {
          const isNext = next?.id === s.id;
          // Las sesiones pendientes (todavía sin llegar) no se pueden tocar.
          const tappable = s.done || isNext;
          const body = (
            <span className={styles.cardRow}>
              <span aria-hidden="true" style={{ width: 24, textAlign: "center", color: s.done ? "var(--c-accent)" : "var(--c-text-2)", font: "var(--fw-bold) var(--fs-body)/1 var(--font)" }}>
                {s.done ? <Icon name="check" size={20} /> : s.position}
              </span>
              <span className={styles.stack} style={{ flex: 1, gap: 2 }}>
                <strong style={{ font: "var(--fw-semibold) var(--fs-body)/1.25 var(--font)" }}>{s.title}</strong>
                <span className={styles.small}>{t("common.minutes", { n: s.suggestedMinutes })}</span>
              </span>
              {isNext ? <span style={{ color: "var(--c-accent)", font: "var(--fw-bold) var(--fs-small)/1 var(--font)" }}>{t("planDetail.next")}</span> : null}
              {s.done ? <span className="sr-only">{t("plans.sessionDone")}</span> : null}
            </span>
          );
          return (
            <li key={s.id}>
              {tappable ? (
                <Card as="button" onClick={() => navigate(`/sesion/${s.id}/antes`)}>{body}</Card>
              ) : (
                <Card className={styles.dim} aria-disabled="true">{body}</Card>
              )}
            </li>
          );
        })}
      </ol>
      <div className={styles.stack}>
        {next ? <Button onClick={() => navigate(`/sesion/${next.id}/antes`)}>{t("planDetail.startSession", { n: next.position })}</Button> : null}
        <Button variant="secondary" onClick={() => go("/charla")}>{t("planDetail.talkAboutPlan")}</Button>
      </div>
    </div>
  );
}
