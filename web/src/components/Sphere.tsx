import { wavePoints } from "../lib/wave";
import styles from "./Sphere.module.css";

type Props = {
  /** Encendida: el coach está disponible. Apagada: sin coach (sin conexión o bolsón agotado). */
  on?: boolean;
  size?: number;
};

const slow = wavePoints(780, 100, 44);
const slowRev = wavePoints(780, 100, 30, 390, 1.8);

/** Esfera del coach: respira cuando está encendida; apagada queda quieta, con una línea plana. */
export function Sphere({ on = true, size = 200 }: Props) {
  const k = size / 200;
  return (
    <div className={styles.root} style={{ width: size, height: size }} aria-hidden="true" data-on={on}>
      <div className={styles.shadow} />
      <div className={on ? styles.bodyOn : styles.bodyOff} />
      <div className={styles.clip}>
        {on ? (
          <>
            <div className={styles.idle} style={{ transform: `scale(${k})`, transformOrigin: "0 0" }}>
              <svg className={styles.flowSlow} width="780" height="200" viewBox="0 0 780 200" fill="none">
                <polyline points={slow} stroke="var(--c-wave-dark)" strokeOpacity=".9" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
            <div className={styles.idle} style={{ transform: `scale(${k})`, transformOrigin: "0 0" }}>
              <svg className={styles.flowRevSlow} width="780" height="200" viewBox="0 0 780 200" fill="none">
                <polyline points={slowRev} stroke="var(--c-wave-dark)" strokeOpacity=".5" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
          </>
        ) : (
          <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
            <line x1="0" y1="100" x2="200" y2="100" stroke="var(--c-text-2)" strokeOpacity=".4" strokeWidth="6" strokeLinecap="round" />
            <line x1="0" y1="92" x2="200" y2="92" stroke="var(--c-text-2)" strokeOpacity=".22" strokeWidth="4" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <div className={styles.rim} />
    </div>
  );
}
