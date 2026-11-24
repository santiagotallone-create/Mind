import { describe, expect, it } from "vitest";
import { es } from "../i18n/es";
import { formatClock, formatLongDate, formatMinutes, typicalMinutes } from "../i18n/format";
import { t } from "../i18n";

function leaves(node: unknown, path = ""): [string, string][] {
  if (typeof node === "string") return [[path, node]];
  return Object.entries(node as object).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
}

describe("catálogo de textos", () => {
  it("todas las claves tienen texto (salvo la técnica «otra», que no se muestra)", () => {
    const vacias = leaves(es).filter(([k, v]) => v.trim() === "" && k !== "technique.otra");
    expect(vacias).toEqual([]);
  });

  it("usa tuteo, sin voseo", () => {
    const voseo = leaves(es).filter(([, v]) => /\b(tenés|querés|podés|contá|tocá|hablá|elegí|decime|sos|vos)\b/i.test(v));
    expect(voseo).toEqual([]);
  });

  it("reemplaza parámetros y deja visible el que falta", () => {
    expect(t("plans.sessionOf", { done: 3, total: 5, minutes: 10 })).toBe("Sesión 3 de 5 · 10 min");
    expect(t("player.planAndSession", { n: 3 })).toContain("{plan}");
  });
});

describe("formatos", () => {
  it("fecha larga sin desplazar el día por la zona horaria", () => {
    expect(formatLongDate("2026-12-01")).toBe("1 de diciembre");
    expect(formatLongDate("2026-01-31")).toBe("31 de enero");
  });
  it("minutos y horas", () => {
    expect(formatMinutes(50)).toBe("50 min");
    expect(formatMinutes(120)).toBe("2 h");
    expect(formatMinutes(90)).toBe("1 h 30 min");
  });
  it("reloj del reproductor", () => {
    expect(formatClock(342)).toBe("5:42");
    expect(formatClock(5)).toBe("0:05");
  });
  it("duración más habitual del plan (mediana)", () => {
    expect(typicalMinutes([5, 10, 10, 15, 10])).toBe(10);
    expect(typicalMinutes([15, 15, 10, 15, 10])).toBe(15);
    expect(typicalMinutes([])).toBe(0);
  });
});
