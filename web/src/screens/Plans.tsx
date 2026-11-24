import { Link, useNavigate } from "react-router";
import { useGoWithOrigin } from "../app/navigation";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ProgressRing } from "../components/ProgressRing";
import { Row } from "../components/Row";
import { t } from "../i18n";
import { typicalMinutes } from "../i18n/format";
import { getFavorites, getNextSession, getPlanSessions, plans } from "../mocks/data";
import styles from "./screens.module.css";

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function Plans() {
  const go = useGoWithOrigin();
  const navigate = useNavigate();
  const favorites = getFavorites();

  return (
    <div className={styles.stackLoose}>
      <h1 className={styles.title}>{t("plans.title")}</h1>
      <div className={styles.stack}>
        {plans.map((plan) => {
          const minutes = typicalMinutes(getPlanSessions(plan.id).map((s) => s.suggestedMinutes));
          const next = getNextSession(plan.id);
          const completed = plan.status === "completado";
          // El anillo del prototipo muestra la sesión en curso («3/5» con 2 hechas) y, completado, el total.
          const current = completed ? plan.sessionsTotal : plan.sessionsDone + 1;
          return (
            <Card key={plan.id} as={Link} to={`/planes/${plan.id}`}>
              <span className={styles.cardRow}>
                <ProgressRing done={current} total={plan.sessionsTotal} label={t("plans.progressAria", { current, total: plan.sessionsTotal })} />
                <span className={styles.stack} style={{ flex: 1, gap: 2 }}>
                  <strong style={{ font: "var(--fw-bold) var(--fs-card-title)/1.25 var(--font)" }}>{plan.name}</strong>
                  <span className={styles.small}>
                    {completed
                      ? t("plans.sessionsCount", { n: plan.sessionsTotal, minutes })
                      : t("plans.sessionOf", { done: plan.sessionsDone + 1, total: plan.sessionsTotal, minutes })}
                  </span>
                  <span className={styles.small}>
                    {completed ? t("plans.completed") : next ? t("plans.next", { title: lowerFirst(next.title) }) : null}
                  </span>
                </span>
              </span>
            </Card>
          );
        })}
      </div>

      <section className={styles.stack} aria-labelledby="fav">
        <h2 id="fav" className={styles.section}>{t("plans.favorites")}</h2>
        {favorites.length === 0 ? (
          <p className={styles.small}>{t("plans.favoritesEmpty")}</p>
        ) : (
          favorites.map((s) => (
            <Card key={s.id} as="button" onClick={() => navigate(`/sesion/${s.id}/antes`)}>
              <Row title={s.title} subtitle={t("common.minutes", { n: s.suggestedMinutes })} />
            </Card>
          ))
        )}
      </section>

      <Button variant="secondary" onClick={() => go("/charla")}>
        {t("plans.requestNewPlan")}
      </Button>
    </div>
  );
}
