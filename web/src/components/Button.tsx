import type { ButtonHTMLAttributes } from "react";
import styles from "./ui.module.css";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "destructive" };

export function Button({ variant = "primary", className, ...rest }: Props) {
  return <button type="button" className={[styles.btn, styles[variant], className].filter(Boolean).join(" ")} {...rest} />;
}
