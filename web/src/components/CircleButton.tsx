import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";
import styles from "./ui.module.css";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon: IconName;
  /** Obligatoria: el botón no tiene texto visible. */
  label: string;
  size?: "small" | "big";
};

export function CircleButton({ icon, label, size = "small", className, ...rest }: Props) {
  const cls = [styles.circle, size === "big" ? styles.circleBig : styles.circleSmall, className].filter(Boolean).join(" ");
  return (
    <button type="button" aria-label={label} className={cls} {...rest}>
      <Icon name={icon} size={size === "big" ? 30 : 22} filled={icon === "play" || icon === "pause"} />
    </button>
  );
}
