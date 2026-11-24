import { t } from "../i18n";
import styles from "./ui.module.css";

type Props = { options: readonly number[]; value: number; onChange: (minutes: number) => void; label: string };

/** Selector de duración (5 / 10 / 15 min): un solo valor elegido, como grupo de opciones. */
export function DurationSelector({ options, value, onChange, label }: Props) {
  return (
    <div className={styles.durations} role="radiogroup" aria-label={label}>
      {options.map((m) => (
        <button key={m} type="button" role="radio" aria-checked={m === value} className={styles.duration} onClick={() => onChange(m)}>
          {t("common.minutes", { n: m })}
        </button>
      ))}
    </div>
  );
}
