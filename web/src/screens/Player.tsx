import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { CircleButton } from "../components/CircleButton";
import { FavoriteStar } from "../components/FavoriteStar";
import { ProgressBar } from "../components/ProgressBar";
import { VoiceLine } from "../components/VoiceLine";
import { t } from "../i18n";
import { formatClock } from "../i18n/format";
import { getPlan, getSession } from "../mocks/data";
import styles from "./screens.module.css";

// Marcador: el reproductor real (audio, Media Session, pantalla encendida) llega en su historia.
const DEMO_TOTAL = 600;
const DEMO_ELAPSED = 342;

export function Player() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const session = getSession(sessionId);
  const [paused, setPaused] = useState(false);
  const [favorite, setFavorite] = useState(session?.favorite ?? false);
  if (!session) return <Navigate to="/planes" replace />;
  const plan = getPlan(session.planId);

  return (
    <div className={styles.player}>
      <div className={styles.playerTop}>
        <FavoriteStar favorite={favorite} onToggle={() => setFavorite((f) => !f)} />
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
        <div className={styles.progressWrap}>
          <ProgressBar value={DEMO_ELAPSED} max={DEMO_TOTAL} label={session.title} />
          <span className={styles.time}>{formatClock(DEMO_TOTAL - DEMO_ELAPSED)}</span>
        </div>
      </div>
    </div>
  );
}
