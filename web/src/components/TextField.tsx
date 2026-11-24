import { useId, type TextareaHTMLAttributes } from "react";
import styles from "./ui.module.css";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string };

export function TextField({ label, ...rest }: Props) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.fieldLabel}>{label}</label>
      <textarea id={id} className={styles.input} {...rest} />
    </div>
  );
}
