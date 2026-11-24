import { wavePoints } from "../lib/wave";
import styles from "./VoiceLine.module.css";

type Props = {
  /** En pausa la onda se aplana a una línea quieta (meditación y charla). */
  paused?: boolean;
  width?: number;
  height?: number;
};

const front = wavePoints(780, 70, 52);
const back = wavePoints(780, 70, 36, 390, 2.1);

/** Línea de voz: onda que fluye mientras suena; plana cuando se pausa. */
export function VoiceLine({ paused = false, width = 342, height = 140 }: Props) {
  return (
    <div className={styles.root} style={{ width, height }} aria-hidden="true" data-paused={paused}>
      <div className={styles.wave} data-hidden={paused}>
        <div className={styles.amp} style={{ height }}>
          <svg className={styles.flow} width="780" height={height} viewBox={`0 0 780 ${height}`} fill="none">
            <polyline points={front} vectorEffect="non-scaling-stroke" stroke="var(--c-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className={styles.amp2} style={{ height, marginTop: -height }}>
          <svg className={styles.flowRev} width="780" height={height} viewBox={`0 0 780 ${height}`} fill="none">
            <polyline points={back} vectorEffect="non-scaling-stroke" stroke="var(--c-accent)" strokeOpacity=".45" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      <svg className={styles.flat} data-visible={paused} width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none">
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="var(--c-text-2)" strokeOpacity=".55" strokeWidth="3" strokeLinecap="round" />
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="var(--c-text-2)" strokeOpacity=".25" strokeWidth="6" strokeLinecap="round" />
      </svg>
    </div>
  );
}
