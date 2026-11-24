import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { useGoWithOrigin } from "../app/navigation";
import { Button } from "../components/Button";
import { DurationSelector } from "../components/DurationSelector";
import { ScreenHeader } from "../components/ScreenHeader";
import { t } from "../i18n";
import { DURATIONS, getSession } from "../mocks/data";
import styles from "./screens.module.css";

export function SessionBefore() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const go = useGoWithOrigin();
  const session = getSession(sessionId);
  const [minutes, setMinutes] = useState<number>(session?.suggestedMinutes ?? DURATIONS[1]!);
  if (!session) return <Navigate to="/planes" replace />;

  return (
    <div className={styles.stackLoose} style={{ flex: 1 }}>
      {/* «‹ Atrás» vuelve al detalle del plan. */}
      <ScreenHeader onBack={() => navigate(`/planes/${session.planId}`)} />
      <div>
        <h1 className={styles.title}>{session.title}</h1>
        <p className={styles.lead}>{t(`techniqueIntro.${session.technique}`)}</p>
      </div>
      <div className={styles.stack}>
        <h2 className={styles.section}>{t("before.duration")}</h2>
        <DurationSelector options={DURATIONS} value={minutes} onChange={setMinutes} label={t("before.duration")} />
      </div>
      <div className={styles.bottom}>
        <Button onClick={() => navigate(`/sesion/${session.id}/reproductor`, { state: { minutes } })}>{t("before.start")}</Button>
        <Button variant="secondary" onClick={() => go("/charla")}>{t("before.talkAboutMeditation")}</Button>
      </div>
    </div>
  );
}
