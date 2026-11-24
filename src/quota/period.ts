/** Cálculo de fechas del bolsón. Todo se resuelve en la zona horaria del usuario. */

export const DEFAULT_TIMEZONE = "Europe/Rome";

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Si la zona guardada no es válida se usa la de por defecto, para no romper la consulta del saldo. */
export function safeTimeZone(timeZone: string | undefined | null): string {
  return timeZone && isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
}

interface WallClock {
  year: number;
  month: number; // 1 a 12
  day: number;
  hour: number;
  minute: number;
  second: number;
  ms: number;
}

function wallClockIn(date: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
    ms: date.getUTCMilliseconds(),
  };
}

/** Diferencia, en ms, entre la hora de pared de la zona y UTC en ese instante. */
function offsetMs(date: Date, timeZone: string): number {
  const w = wallClockIn(date, timeZone);
  const wallAsUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return wallAsUtc - (date.getTime() - date.getUTCMilliseconds());
}

/** Convierte una hora de pared de la zona en un instante. Si la hora no existe (salto de horario), avanza. */
function wallClockToInstant(w: WallClock, timeZone: string): Date {
  const naive = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second, w.ms);
  const firstOffset = offsetMs(new Date(naive), timeZone);
  let guess = naive - firstOffset;
  const secondOffset = offsetMs(new Date(guess), timeZone);
  if (secondOffset !== firstOffset) guess = naive - secondOffset;
  return new Date(guess);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Un mes después de `start`, a la misma hora local. Si el mes siguiente no tiene ese día,
 * vence el último día de ese mes (31 de enero -> 28 de febrero).
 */
export function addOneMonth(start: Date, timeZone: string): Date {
  const w = wallClockIn(start, timeZone);
  let year = w.year;
  let month = w.month + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  const day = Math.min(w.day, daysInMonth(year, month));
  return wallClockToInstant({ ...w, year, month, day }, timeZone);
}

/** Fecha explícita AAAA-MM-DD de un instante, en la zona horaria dada. */
export function localDate(date: Date, timeZone: string): string {
  const w = wallClockIn(date, timeZone);
  const pad = (n: number, size = 2) => String(n).padStart(size, "0");
  return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}`;
}
