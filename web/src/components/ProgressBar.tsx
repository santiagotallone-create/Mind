import styles from "./ui.module.css";

type Props = { value: number; max: number; label: string };

/** Barra de progreso de la meditación, con punto en la posición actual. */
export function ProgressBar({ value, max, label }: Props) {
  const pct = max > 0 ? Math.min(Math.max(value / max, 0), 1) * 100 : 0;
  return (
    <div className={styles.bar} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className={styles.barFill} style={{ width: `${pct}%` }} />
      <div className={styles.barDot} style={{ left: `${pct}%` }} />
    </div>
  );
}
