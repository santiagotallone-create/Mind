import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./ui.module.css";

type Props = { title: string; body?: string; onDismiss: () => void; children: ReactNode };

/** Hoja inferior de confirmación. Escape o tocar fuera = cancelar. */
export function BottomSheet({ title, body, onDismiss, children }: Props) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDismiss();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDismiss]);
  return (
    <div className={styles.scrim} onClick={onDismiss}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <h2 id={titleId} className={styles.sheetTitle}>{title}</h2>
        {body ? <p className={styles.sheetBody}>{body}</p> : null}
        {children}
      </div>
    </div>
  );
}
