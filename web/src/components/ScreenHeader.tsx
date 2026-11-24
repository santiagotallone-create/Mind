import type { ReactNode } from "react";
import { t } from "../i18n";
import { CircleButton } from "./CircleButton";
import { Icon } from "./Icon";
import styles from "./ui.module.css";

type Props = {
  title?: string;
  /** «‹ Atrás» a la izquierda. */
  onBack?: () => void;
  /** ✕ arriba a la derecha. */
  onClose?: () => void;
  start?: ReactNode;
};

export function ScreenHeader({ title, onBack, onClose, start }: Props) {
  return (
    <header className={styles.header}>
      {onBack ? (
        <button type="button" className={styles.back} onClick={onBack}>
          <Icon name="chevronLeft" />
          <span>{t("common.back")}</span>
        </button>
      ) : null}
      {start}
      {title ? <h1 className={styles.headerTitle}>{title}</h1> : null}
      {onClose ? (
        <span className={styles.headerEnd}>
          <CircleButton icon="close" label={t("common.close")} onClick={onClose} />
        </span>
      ) : null}
    </header>
  );
}
