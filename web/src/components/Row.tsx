import type { ReactNode } from "react";
import { Icon } from "./Icon";
import styles from "./ui.module.css";

type Props = { title: string; subtitle?: string; leading?: ReactNode; chevron?: boolean };

/** Contenido de una fila: texto a la izquierda y, opcionalmente, un chevron. Se coloca dentro de una Card tocable. */
export function Row({ title, subtitle, leading, chevron = true }: Props) {
  return (
    <span className={styles.row}>
      {leading}
      <span className={styles.rowText}>
        <span className={styles.rowTitle} style={{ display: "block" }}>{title}</span>
        {subtitle ? <span className={styles.rowSub} style={{ display: "block" }}>{subtitle}</span> : null}
      </span>
      {chevron ? <Icon name="chevronRight" className={styles.chevron} /> : null}
    </span>
  );
}
