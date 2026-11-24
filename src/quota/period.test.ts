import assert from "node:assert/strict";
import { test } from "node:test";
import { addOneMonth, isValidTimeZone, localDate, safeTimeZone } from "./period.js";

const ROME = "Europe/Rome";
const BA = "America/Argentina/Buenos_Aires";

test("un mes después: misma hora local y mismo día", () => {
  const end = addOneMonth(new Date("2026-11-23T10:00:00+01:00"), ROME);
  assert.equal(end.toISOString(), new Date("2026-12-23T10:00:00+01:00").toISOString());
});

test("el 31 de enero vence el último día de febrero", () => {
  assert.equal(addOneMonth(new Date("2027-01-31T10:00:00+01:00"), ROME).toISOString(), new Date("2027-02-28T10:00:00+01:00").toISOString());
});

test("en año bisiesto, el 31 de enero vence el 29 de febrero", () => {
  assert.equal(addOneMonth(new Date("2028-01-31T10:00:00+01:00"), ROME).toISOString(), new Date("2028-02-29T10:00:00+01:00").toISOString());
});

test("el 31 de marzo vence el 30 de abril, y el 30 de marzo también", () => {
  assert.equal(localDate(addOneMonth(new Date("2027-03-31T12:00:00+02:00"), ROME), ROME), "2027-04-30");
  assert.equal(localDate(addOneMonth(new Date("2027-03-30T12:00:00+02:00"), ROME), ROME), "2027-04-30");
});

test("diciembre pasa al enero del año siguiente", () => {
  assert.equal(localDate(addOneMonth(new Date("2026-12-15T09:00:00+01:00"), ROME), ROME), "2027-01-15");
});

test("el cambio de horario no mueve la hora local", () => {
  // 15 de octubre (horario de verano) -> 15 de noviembre (horario normal): sigue siendo las 10:00 locales.
  const end = addOneMonth(new Date("2026-10-15T10:00:00+02:00"), ROME);
  assert.equal(end.toISOString(), new Date("2026-11-15T10:00:00+01:00").toISOString());
});

test("si la hora local no existe por el salto de horario, avanza a la siguiente válida", () => {
  // 28 de febrero 02:30 -> 28 de marzo 02:30 no existe en Roma (el reloj salta de 02:00 a 03:00).
  const end = addOneMonth(new Date("2027-02-28T02:30:00+01:00"), ROME);
  assert.equal(localDate(end, ROME), "2027-03-28");
  assert.ok(end.getTime() >= new Date("2027-03-28T01:00:00Z").getTime());
});

test("usa la zona horaria del usuario", () => {
  const end = addOneMonth(new Date("2026-11-23T10:00:00-03:00"), BA);
  assert.equal(end.toISOString(), new Date("2026-12-23T10:00:00-03:00").toISOString());
});

test("la fecha local depende de la zona", () => {
  const instant = new Date("2026-12-31T23:30:00Z");
  assert.equal(localDate(instant, ROME), "2027-01-01");
  assert.equal(localDate(instant, BA), "2026-12-31");
});

test("zonas horarias inválidas caen en la de por defecto", () => {
  assert.equal(isValidTimeZone("Europe/Rome"), true);
  assert.equal(isValidTimeZone("Marte/Olympus"), false);
  assert.equal(safeTimeZone("Marte/Olympus"), "Europe/Rome");
  assert.equal(safeTimeZone(undefined), "Europe/Rome");
});
