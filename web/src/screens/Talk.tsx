import { useState } from "react";
import { useNavigate } from "react-router";
import { useReturnToOrigin } from "../app/navigation";
import { CircleButton } from "../components/CircleButton";
import { Sphere } from "../components/Sphere";
import { t } from "../i18n";
import styles from "./screens.module.css";

type Props = {
  /** Qué hace la ✕. Por defecto vuelve a la pantalla de origen. */
  onClose?: () => void;
};

/** Marcador de las charlas con el coach (charla, entrevista, charla de cierre). La voz en vivo llega en su historia. */
function TalkScreen({ onClose }: Required<Props>) {
  const [paused, setPaused] = useState(false);
  return (
    <div className={styles.player}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <CircleButton icon="close" label={t("common.close")} onClick={onClose} />
      </div>
      <div className={styles.center}>
        <div>
          <h1 className={styles.talkTitle}>{t("talk.listening")}</h1>
          <p className={styles.lead} aria-live="polite">{paused ? `${t("talk.paused")}. ${t("talk.tapToResume")}` : " "}</p>
        </div>
        <button type="button" className={styles.sphereBtn} aria-label={t(paused ? "talk.resumeAria" : "talk.pauseAria")} aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
          <Sphere on={!paused} />
        </button>
      </div>
    </div>
  );
}

/** Charla desde cualquier pantalla: la ✕ vuelve al origen. */
export function Talk() {
  const back = useReturnToOrigin("/");
  return <TalkScreen onClose={back} />;
}

/** Charla de cierre del plan: al cerrar, a Planes. */
export function ClosingTalk() {
  const navigate = useNavigate();
  return <TalkScreen onClose={() => navigate("/planes", { replace: true })} />;
}

/** Entrevista inicial: al terminar muestra los planes propuestos. */
export function Interview() {
  const navigate = useNavigate();
  return <TalkScreen onClose={() => navigate("/planes-propuestos", { replace: true })} />;
}
