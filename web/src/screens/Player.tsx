import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { CircleButton } from "../components/CircleButton";
import { FavoriteStar } from "../components/FavoriteStar";
import { ProgressBar } from "../components/ProgressBar";
import { VoiceLine } from "../components/VoiceLine";
import { t } from "../i18n";
import { formatClock } from "../i18n/format";
import { useCoach } from "../app/coach";
import { planById, sessionById, usePlansState, usePlansStore } from "../data/plans";
import { Button } from "../components/Button";
import styles from "./screens.module.css";

// Marcador: el reproductor real (audio, Media Session, pantalla encendida) llega en su historia.
const DEMO_TOTAL = 600;
const DEMO_ELAPSED = 342;

export function Player() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const store = usePlansStore();
  const state = usePlansState();
  const { coachAvailable } = useCoach();
  const session = sessionById(state, sessionId);
  const [paused, setPaused] = useState(false);
  if (!session) return <Navigate to="/planes" replace />;
  const plan = planById(state, session.planId);

  // Al llegar al final la sesión cuenta como hecha (D9). Sigue la charla de cierre; sin coach (sin bolsón o sin
  // conexión) se salta y se vuelve a Planes. El audio real que dispara esto llega en #9.
  const finish = () => {
    store.completeSession(session.id);
    navigate(coachAvailable ? "/charla/cierre" : "/planes", { replace: true });
  };

  return (
    <div className={styles.player}>
      <div className={styles.playerTop}>
        <FavoriteStar favorite={session.favorite} onToggle={() => store.setFavorite(session.id, !session.favorite)} />
        <div className={styles.playerTitle}>
          <h1>{session.title}</h1>
          <p className={styles.small}>{t("player.planAndSession", { plan: plan?.name ?? "", n: session.position })}</p>
        </div>
        {/* ✕ en plena meditación: vuelve al detalle del plan. */}
        <CircleButton icon="close" label={t("common.close")} onClick={() => navigate(`/planes/${session.planId}`, { replace: true })} />
      </div>
      <div className={styles.playerMid}>
        <div className={styles.pausedLabel}>{paused ? t("player.paused") : ""}</div>
        <VoiceLine paused={paused} />
      </div>
      <div className={styles.playerBottom}>
        <CircleButton size="big" icon={paused ? "play" : "pause"} label={t(paused ? "player.resume" : "player.pause")} onClick={() => setPaused((p) => !p)} />
        {import.meta.env.DEV ? (
          <Button variant="secondary" onClick={finish}>{t("kit.simulateEnd")}</Button>
        ) : null}
        <div className={styles.progressWrap}>
          <ProgressBar value={DEMO_ELAPSED} max={DEMO_TOTAL} label={session.title} />
          <span className={styles.time}>{formatClock(DEMO_TOTAL - DEMO_ELAPSED)}</span>
        </div>
      </div>
    </div>
  );
}
