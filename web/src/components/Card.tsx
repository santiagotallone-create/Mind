import type { ElementType, ReactNode } from "react";
import styles from "./ui.module.css";

type Props = { as?: ElementType; className?: string; children: ReactNode; [key: string]: unknown };

/** Tarjeta de fondo elevado. Con `as="button"` o `as="a"` es tocable. */
export function Card({ as: Tag = "div", className, children, ...rest }: Props) {
  return (
    <Tag className={[styles.card, className].filter(Boolean).join(" ")} {...(Tag === "button" ? { type: "button" } : {})} {...rest}>
      {children}
    </Tag>
  );
}
