import { NavLink } from "react-router";
import { t } from "../i18n";
import { Icon, type IconName } from "./Icon";
import styles from "./ui.module.css";

const tabs: { to: string; icon: IconName; label: "nav.home" | "nav.plans" | "nav.me"; end?: boolean }[] = [
  { to: "/", icon: "home", label: "nav.home", end: true },
  { to: "/planes", icon: "list", label: "nav.plans" },
  { to: "/yo", icon: "user", label: "nav.me" },
];

/** Menú inferior de tres pestañas. La pestaña activa lleva aria-current="page". */
export function TabBar() {
  return (
    <nav aria-label={t("nav.label")} className={styles.tabs}>
      {tabs.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.end} className={styles.tab}>
          <Icon name={tab.icon} />
          <span>{t(tab.label)}</span>
        </NavLink>
      ))}
    </nav>
  );
}
