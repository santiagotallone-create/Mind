import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { useCoach } from "../app/coach";
import { BottomSheet } from "../components/BottomSheet";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Row } from "../components/Row";
import { ScreenHeader } from "../components/ScreenHeader";
import { TextField } from "../components/TextField";
import { t } from "../i18n";
import { formatLongDate, formatMinutes } from "../i18n/format";
import { profile } from "../mocks/data";
import styles from "./screens.module.css";

export function Me() {
  const navigate = useNavigate();
  return (
    <div className={styles.stackLoose}>
      <h1 className={styles.title}>{t("me.title")}</h1>
      <div className={styles.stack}>
        <Card as="button" onClick={() => navigate("/yo/perfil")}>
          <Row title={t("me.profile")} subtitle={t("me.profileHint")} />
        </Card>
        <Card as="button" onClick={() => navigate("/yo/ajustes")}>
          <Row title={t("me.settings")} subtitle={t("me.settingsHint")} />
        </Card>
      </div>
    </div>
  );
}

const fields = ["objetivos", "experiencia", "estado"] as const;
type Field = (typeof fields)[number];

export function Profile() {
  const navigate = useNavigate();
  const items: { field: Field; title: string; value: string; aria: string }[] = [
    { field: "objetivos", title: t("profile.goals"), value: profile.goals, aria: t("profile.editGoals") },
    { field: "experiencia", title: t("profile.experience"), value: profile.experience ? t(`profile.experienceOptions.${profile.experience}`) : t("profile.notSet"), aria: t("profile.editExperience") },
    { field: "estado", title: t("profile.currentState"), value: profile.currentState, aria: t("profile.editCurrentState") },
  ];
  return (
    <div className={styles.stackLoose}>
      <ScreenHeader onBack={() => navigate("/yo")} />
      <div>
        <h1 className={styles.title}>{t("profile.title")}</h1>
        <p className={styles.lead}>{t("profile.hint")}</p>
      </div>
      <div className={styles.stack}>
        {items.map((it) => (
          <Card key={it.field}>
            <div className={styles.cardRow}>
              <div className={styles.stack} style={{ flex: 1, gap: 2 }}>
                <span className={styles.small}>{it.title}</span>
                <strong style={{ font: "var(--fw-semibold) var(--fs-body)/1.35 var(--font)" }}>{it.value}</strong>
              </div>
              <Button variant="secondary" style={{ width: "auto", minHeight: "var(--tap)" }} aria-label={it.aria} onClick={() => navigate(`/yo/perfil/editar/${it.field}`)}>
                {t("common.edit")}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function EditProfile() {
  const { campo } = useParams();
  const navigate = useNavigate();
  const field = fields.find((f) => f === campo);
  const initial = field === "objetivos" ? profile.goals : field === "estado" ? profile.currentState : (profile.experience ?? "");
  const [value, setValue] = useState<string>(initial);
  if (!field) return <Navigate to="/yo/perfil" replace />;

  const title = t(field === "objetivos" ? "profile.goals" : field === "experiencia" ? "profile.experience" : "profile.currentState");
  const hint = t(field === "objetivos" ? "profile.goalsHint" : field === "experiencia" ? "profile.experienceHint" : "profile.currentStateHint");
  const options = ["principiante", "algo_practica", "mucha_practica"] as const;
  // Marcador: guardar de verdad (PATCH /v1/profile) llega con la historia de perfil.
  const save = () => navigate("/yo/perfil", { replace: true });

  return (
    <div className={styles.stackLoose} style={{ flex: 1 }}>
      <ScreenHeader onBack={() => navigate("/yo/perfil")} />
      <div>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.lead}>{hint}</p>
      </div>
      {field === "experiencia" ? (
        <div className={styles.stack} role="radiogroup" aria-label={title}>
          {options.map((o) => (
            <Card key={o} as="button" role="radio" aria-checked={value === o} onClick={() => setValue(o)} style={value === o ? { borderColor: "var(--c-accent)", background: "var(--c-card-raised)" } : undefined}>
              {t(`profile.experienceOptions.${o}`)}
            </Card>
          ))}
        </div>
      ) : (
        <TextField label={title} value={value} onChange={(e) => setValue(e.target.value)} />
      )}
      <div className={styles.bottom}>
        <Button onClick={save}>{t("common.save")}</Button>
      </div>
    </div>
  );
}

export function Settings() {
  const navigate = useNavigate();
  const { quota } = useCoach();
  return (
    <div className={styles.stackLoose}>
      <ScreenHeader onBack={() => navigate("/yo")} />
      <h1 className={styles.title}>{t("settings.title")}</h1>
      <Card>
        <div className={styles.stack} style={{ gap: 4 }}>
          <h2 className={styles.heading}>{t("settings.usage")}</h2>
          {quota ? (
            <>
              <p style={{ font: "var(--fw-semibold) var(--fs-lead)/1.3 var(--font)" }}>
                {t("settings.remaining", { remaining: formatMinutes(quota.minutesRemaining), total: formatMinutes(quota.secondsTotal / 60) })}
              </p>
              {quota.renewsOn ? <p className={styles.small}>{t("settings.renewsOn", { date: formatLongDate(quota.renewsOn) })}</p> : null}
            </>
          ) : (
            <p className={styles.small}>{t("settings.usageUnknown")}</p>
          )}
        </div>
      </Card>
      <Card as="button" onClick={() => navigate("/yo/ajustes/privacidad")}>
        <Row title={t("settings.privacy")} subtitle={t("settings.privacyHint")} />
      </Card>
    </div>
  );
}

export function Privacy() {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  return (
    <div className={styles.stackLoose}>
      <ScreenHeader onBack={() => navigate("/yo/ajustes")} />
      <div>
        <h1 className={styles.title}>{t("settings.privacy")}</h1>
        <p className={styles.lead}>{t("settings.privacyIntro")}</p>
      </div>
      <Button variant="destructive" onClick={() => setConfirming(true)}>{t("settings.deleteAll")}</Button>
      {confirming ? (
        <BottomSheet title={t("settings.confirmTitle")} body={t("settings.confirmBody")} onDismiss={() => setConfirming(false)}>
          {/* Marcador: el borrado real (DELETE /v1/me) llega con la historia de privacidad. */}
          <Button variant="destructive" onClick={() => navigate("/datos-borrados", { replace: true })}>{t("settings.confirmDelete")}</Button>
          <Button variant="secondary" onClick={() => setConfirming(false)}>{t("common.cancel")}</Button>
        </BottomSheet>
      ) : null}
    </div>
  );
}

export function DataDeleted() {
  const navigate = useNavigate();
  return (
    <div className={styles.center}>
      <div>
        <h1 className={styles.talkTitle}>{t("settings.deletedTitle")}</h1>
        <p className={styles.lead}>{t("settings.deletedBody")}</p>
      </div>
      <Button onClick={() => navigate("/primer-uso", { replace: true })}>{t("common.continue")}</Button>
    </div>
  );
}
