import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlansStore, nextSessionOf, sessionsOf, type PlansState } from "../data/plans";
import { t } from "../i18n";
import { PLAN_SLEEP, PLAN_TENSION, seedState } from "../mocks/data";
import { renderApp } from "./render";

function build(edit: (store: PlansStore, s: PlansState) => void): PlansState {
  const store = new PlansStore(seedState());
  edit(store, store.getState());
  return store.getState();
}
const completed = () =>
  build((store, s) => sessionsOf(s, PLAN_TENSION).forEach((x) => store.completeSession(x.id, new Date("2026-11-20T08:00:00Z"))));
const noFavorites = () => build((store, s) => s.sessions.forEach((x) => store.setFavorite(x.id, false)));
const noPlans = (): PlansState => ({ plans: [], sessions: [] });

describe("Planes", () => {
  it("plan en curso: sesión actual, duración y siguiente", () => {
    renderApp("/planes");
    const card = screen.getByRole("link", { name: /Soltar la tensión/ });
    expect(within(card).getByText("Sesión 3 de 5 · 10 min")).toBeInTheDocument();
    expect(within(card).getByText("Siguiente: escaneo corporal")).toBeInTheDocument();
    expect(within(card).getByRole("img", { name: t("plans.progressAria", { current: 3, total: 5 }) })).toBeInTheDocument();
  });

  it("muestra varios planes activos", () => {
    renderApp("/planes");
    expect(screen.getByRole("link", { name: /Soltar la tensión/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Dormir mejor/ })).toBeInTheDocument();
  });

  it("plan completado: sigue visible en Planes con «Plan completado»", () => {
    renderApp("/planes", undefined, null, completed());
    const card = screen.getByRole("link", { name: /Soltar la tensión/ });
    expect(within(card).getByText(t("plans.completed"))).toBeInTheDocument();
    expect(within(card).getByText("5 sesiones · 10 min")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Dormir mejor/ })).toBeInTheDocument();
  });

  it("favoritas vacías: solo «Aún no tienes favoritas»", () => {
    renderApp("/planes", undefined, null, noFavorites());
    expect(screen.getByText(t("plans.favoritesEmpty"))).toBeInTheDocument();
  });

  it("tocar una favorita abre «Antes de empezar»", async () => {
    const { user } = renderApp("/planes");
    await user.click(screen.getByRole("button", { name: /Escaneo corporal/ }));
    expect(screen.getByRole("button", { name: t("before.start") })).toBeInTheDocument();
  });

  it("sin planes: queda el botón para pedir uno al coach", () => {
    renderApp("/planes", undefined, null, noPlans());
    expect(screen.getByRole("button", { name: t("plans.requestNewPlan") })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Soltar la tensión/ })).not.toBeInTheDocument();
  });
});

describe("Plan en detalle", () => {
  it("plan completado: todas las sesiones se pueden repetir y solo queda «Hablar con el coach»", () => {
    renderApp(`/planes/${PLAN_TENSION}`, undefined, null, completed());
    expect(screen.getByText(t("planDetail.completedProgress", { total: 5 }))).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: t("plans.sessionsAria") })).getAllByRole("button")).toHaveLength(5);
    expect(screen.queryByRole("button", { name: /Empezar sesión/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("planDetail.talkAboutPlan") })).toBeInTheDocument();
  });

  it("«Empezar sesión N» abre «Antes de empezar» de la siguiente", async () => {
    const { user } = renderApp(`/planes/${PLAN_TENSION}`);
    await user.click(screen.getByRole("button", { name: t("planDetail.startSession", { n: 3 }) }));
    expect(screen.getByRole("heading", { name: "Escaneo corporal" })).toBeInTheDocument();
  });

  it("un plan que no existe vuelve a Planes", () => {
    renderApp("/planes/no-existe");
    expect(screen.getByRole("heading", { name: t("plans.title") })).toBeInTheDocument();
  });
});

describe("Terminar una meditación", () => {
  const next = nextSessionOf(seedState(), PLAN_TENSION)!;

  it("con coach: cuenta la sesión como hecha y sigue la charla de cierre; el plan avanza", async () => {
    const { user } = renderApp(`/sesion/${next.id}/reproductor`);
    await user.click(screen.getByRole("button", { name: t("kit.simulateEnd") }));
    expect(screen.getByRole("heading", { name: t("talk.listening") })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t("common.close") })); // la charla de cierre vuelve a Planes
    const card = screen.getByRole("link", { name: /Soltar la tensión/ });
    expect(within(card).getByText("Sesión 4 de 5 · 10 min")).toBeInTheDocument();
    expect(within(card).getByText("Siguiente: visualización")).toBeInTheDocument();
  });

  it("sin bolsón: se salta la charla de cierre y vuelve a Planes", async () => {
    const { user } = renderApp(`/sesion/${next.id}/reproductor`, { quotaOk: false });
    await user.click(screen.getByRole("button", { name: t("kit.simulateEnd") }));
    expect(screen.getByRole("heading", { name: t("plans.title") })).toBeInTheDocument();
  });

  it("sin conexión: se salta la charla de cierre y vuelve a Planes", async () => {
    const { user } = renderApp(`/sesion/${next.id}/reproductor`, { online: false });
    await user.click(screen.getByRole("button", { name: t("kit.simulateEnd") }));
    expect(screen.getByRole("heading", { name: t("plans.title") })).toBeInTheDocument();
  });

  it("al terminar la última sesión el plan queda completado", async () => {
    const almost = build((store, s) => sessionsOf(s, PLAN_TENSION).slice(0, 4).forEach((x) => store.completeSession(x.id)));
    const last = nextSessionOf(almost, PLAN_TENSION)!;
    expect(last.position).toBe(5);
    const { user } = renderApp(`/sesion/${last.id}/reproductor`, { online: false }, null, almost);
    await user.click(screen.getByRole("button", { name: t("kit.simulateEnd") }));
    expect(within(screen.getByRole("link", { name: /Soltar la tensión/ })).getByText(t("plans.completed"))).toBeInTheDocument();
  });

  it("terminar dos veces la misma sesión no suma dos veces", () => {
    const store = new PlansStore(seedState());
    store.completeSession(next.id, new Date("2026-11-20T08:00:00Z"));
    const first = store.getState().sessions.find((x) => x.id === next.id)!.doneAt;
    store.completeSession(next.id, new Date("2026-11-21T08:00:00Z"));
    const after = store.getState();
    expect(after.sessions.find((x) => x.id === next.id)!.doneAt).toBe(first);
    expect(after.plans.find((p) => p.id === PLAN_TENSION)!.sessionsDone).toBe(3);
  });
});

describe("Favoritas", () => {
  it("la estrella del reproductor marca la sesión como favorita", async () => {
    const empty = noFavorites();
    const target = nextSessionOf(empty, PLAN_SLEEP)!;
    const { user } = renderApp(`/sesion/${target.id}/reproductor`, undefined, null, empty);
    await user.click(screen.getByRole("button", { name: t("player.addFavorite") }));
    expect(screen.getByRole("button", { name: t("player.removeFavorite") })).toHaveAttribute("aria-pressed", "true");
  });
});
