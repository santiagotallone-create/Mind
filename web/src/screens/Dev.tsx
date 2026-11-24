import { Link } from "react-router";
import { useDemo } from "../app/demo";
import { t } from "../i18n";
import { sessions, plans } from "../mocks/data";
import styles from "./screens.module.css";

/** Mapa de pantallas y controles de demo. Solo existe en desarrollo (import.meta.env.DEV). */
export function DevMap() {
  const { quotaOk, online, setQuotaOk, setOnline } = useDemo();
  const firstSession = sessions[2]!.id;
  const links: [string, string][] = [
    ["/", t("nav.home")],
    ["/planes", t("plans.title")],
    [`/planes/${plans[0]!.id}`, t("planDetail.talkAboutPlan")],
    [`/sesion/${firstSession}/antes`, t("before.duration")],
    [`/sesion/${firstSession}/reproductor`, t("stub.screens.player")],
    ["/yo", t("me.title")],
    ["/yo/perfil", t("profile.title")],
    ["/yo/ajustes", t("settings.title")],
    ["/charla", t("stub.screens.talk")],
    ["/charla/cierre", t("stub.screens.closingTalk")],
    ["/primer-uso", t("stub.screens.activationFirst")],
    ["/entrevista", t("stub.screens.interview")],
    ["/planes-propuestos", t("stub.screens.proposedPlans")],
    ["/sin-coach", t("stub.screens.coachUnavailable")],
    ["/datos-borrados", t("stub.screens.dataDeleted")],
  ];
  return (
    <div className={styles.stackLoose}>
      <h1 className={styles.title}>{t("kit.map")}</h1>
      <div className={styles.stack}>
        <div className={styles.toggles}>
          <span className={styles.small}>{t("kit.demoQuota")}</span>
          <button type="button" aria-pressed={quotaOk} onClick={() => setQuotaOk(true)}>{t("kit.demoQuotaOn")}</button>
          <button type="button" aria-pressed={!quotaOk} onClick={() => setQuotaOk(false)}>{t("kit.demoQuotaOff")}</button>
        </div>
        <div className={styles.toggles}>
          <span className={styles.small}>{t("kit.demoConnection")}</span>
          <button type="button" aria-pressed={online} onClick={() => setOnline(true)}>{t("kit.demoOnline")}</button>
          <button type="button" aria-pressed={!online} onClick={() => setOnline(false)}>{t("kit.demoOffline")}</button>
        </div>
      </div>
      <div className={styles.mapList}>
        {links.map(([to, label]) => (
          <Link key={to} to={to} className={styles.mapLink}>{label} <span className={styles.small}>{to}</span></Link>
        ))}
      </div>
    </div>
  );
}
