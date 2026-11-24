import { t } from "./index";

/** «2026-12-01» → «1 de diciembre». Se formatea como fecha sin zona: no se desplaza por la zona del teléfono. */
export function formatLongDate(isoDate: string, locale = "es"): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** 50 → «50 min»; 120 → «2 h»; 90 → «1 h 30 min». */
export function formatMinutes(totalMinutes: number): string {
  if (totalMinutes < 60) return t("common.minutes", { n: totalMinutes });
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? t("common.hours", { n: h }) : t("common.hoursMinutes", { h, m });
}

/** Duración más habitual del plan: la mediana de los minutos sugeridos de sus sesiones (decidido por Santi, 23/11). */
export function typicalMinutes(minutes: readonly number[]): number {
  if (minutes.length === 0) return 0;
  const sorted = [...minutes].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] as number;
}

/** 342 → «5:42». */
export function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
