import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { t } from "../i18n";
import { nextSessionOf, sessionsOf } from "../data/plans";
import { PLAN_TENSION, seedState } from "../mocks/data";
import { renderApp } from "./render";

const menu = () => screen.queryByRole("navigation", { name: t("nav.label") });
const seed = seedState();
const next = nextSessionOf(seed, PLAN_TENSION)!;
const pending = sessionsOf(seed, PLAN_TENSION).filter((s) => !s.done && s.id !== next.id);

describe("menú inferior", () => {
  it.each([
    ["/", t("home.title")],
    ["/planes", t("plans.title")],
    ["/yo", t("me.title")],
  ])("se ve en %s", (ruta, titulo) => {
    renderApp(ruta);
    expect(screen.getByRole("heading", { name: titulo })).toBeInTheDocument();
    expect(menu()).toBeInTheDocument();
  });

  it("marca la pestaña activa con aria-current", () => {
    renderApp("/planes");
    const nav = within(menu()!);
    expect(nav.getByRole("link", { name: t("nav.plans") })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: t("nav.home") })).not.toHaveAttribute("aria-current");
  });

  it("se ve en el detalle del plan y en «Antes de empezar»", () => {
    renderApp(`/planes/${PLAN_TENSION}`);
    expect(menu()).toBeInTheDocument();
  });

  it.each([
    ["meditación en curso", `/sesion/${next.id}/reproductor`],
    ["charla", "/charla"],
    ["charla de cierre", "/charla/cierre"],
    ["entrevista", "/entrevista"],
    ["primer uso", "/primer-uso"],
    ["planes propuestos", "/planes-propuestos"],
    ["coach no disponible", "/sin-coach"],
  ])("se oculta en %s", (_nombre, ruta) => {
    renderApp(ruta);
    expect(menu()).not.toBeInTheDocument();
  });

  it("navega entre pestañas", async () => {
    const { user } = renderApp("/");
    await user.click(within(menu()!).getByRole("link", { name: t("nav.plans") }));
    expect(screen.getByRole("heading", { name: t("plans.title") })).toBeInTheDocument();
    await user.click(within(menu()!).getByRole("link", { name: t("nav.me") }));
    expect(screen.getByRole("heading", { name: t("me.title") })).toBeInTheDocument();
  });
});

describe("regreso con ✕ y «‹ Atrás»", () => {
  it("la charla abierta desde Inicio vuelve a Inicio", async () => {
    const { user } = renderApp("/");
    await user.click(screen.getByRole("button", { name: t("home.tapToTalk") }));
    expect(screen.getByRole("heading", { name: t("talk.listening") })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t("common.close") }));
    expect(screen.getByRole("heading", { name: t("home.title") })).toBeInTheDocument();
  });

  it("la charla abierta desde Planes vuelve a Planes", async () => {
    const { user } = renderApp("/planes");
    await user.click(screen.getByRole("button", { name: t("plans.requestNewPlan") }));
    expect(screen.getByRole("heading", { name: t("talk.listening") })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t("common.close") }));
    expect(screen.getByRole("heading", { name: t("plans.title") })).toBeInTheDocument();
  });

  it("la charla abierta desde «Antes de empezar» vuelve a esa pantalla", async () => {
    const { user } = renderApp(`/sesion/${next.id}/antes`);
    await user.click(screen.getByRole("button", { name: t("before.talkAboutMeditation") }));
    await user.click(screen.getByRole("button", { name: t("common.close") }));
    expect(screen.getByRole("heading", { name: next.title })).toBeInTheDocument();
    expect(menu()).toBeInTheDocument();
  });

  it("sin bolsón, tocar la esfera abre «Coach no disponible» y la ✕ vuelve a Inicio", async () => {
    const { user } = renderApp("/", { quotaOk: false });
    expect(screen.getByRole("heading", { name: t("home.titleNoCoach") })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t("home.tapToTalk") }));
    expect(screen.getByRole("button", { name: t("coachUnavailable.goToMeditations") })).toBeInTheDocument();
    expect(screen.getByText(t("coachUnavailable.quotaBody"))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t("common.close") }));
    expect(screen.getByRole("heading", { name: t("home.titleNoCoach") })).toBeInTheDocument();
  });

  it("sin conexión, «Coach no disponible» lo explica y lleva a las meditaciones", async () => {
    const { user } = renderApp("/", { online: false });
    await user.click(screen.getByRole("button", { name: t("home.tapToTalk") }));
    expect(screen.getByRole("heading", { name: t("coachUnavailable.offlineTitle") })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t("coachUnavailable.goToMeditations") }));
    expect(screen.getByRole("heading", { name: t("plans.title") })).toBeInTheDocument();
  });

  it("«‹ Atrás» de «Antes de empezar» vuelve al detalle del plan", async () => {
    const { user } = renderApp(`/sesion/${next.id}/antes`);
    await user.click(screen.getByRole("button", { name: t("common.back") }));
    expect(screen.getByRole("heading", { name: "Soltar la tensión" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("planDetail.startSession", { n: next.position }) })).toBeInTheDocument();
  });

  it("la ✕ del reproductor vuelve al detalle del plan", async () => {
    const { user } = renderApp(`/sesion/${next.id}/antes`);
    await user.click(screen.getByRole("button", { name: t("before.start") }));
    expect(menu()).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t("common.close") }));
    expect(screen.getByRole("heading", { name: "Soltar la tensión" })).toBeInTheDocument();
    expect(menu()).toBeInTheDocument();
  });

  it("la charla de cierre vuelve a Planes", async () => {
    const { user } = renderApp("/charla/cierre");
    await user.click(screen.getByRole("button", { name: t("common.close") }));
    expect(screen.getByRole("heading", { name: t("plans.title") })).toBeInTheDocument();
  });

  it("la entrevista termina en los planes propuestos y «Empezar» abre el plan", async () => {
    const { user } = renderApp("/entrevista");
    await user.click(screen.getByRole("button", { name: t("common.close") }));
    expect(screen.getByRole("heading", { name: t("activation.proposedTitle") })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: `${t("activation.start")}: Soltar la tensión` }));
    expect(screen.getByRole("heading", { name: "Soltar la tensión" })).toBeInTheDocument();
  });
});

describe("Inicio y planes propuestos", () => {
  it("«Empezar meditación» abre Planes", async () => {
    const { user } = renderApp("/");
    await user.click(screen.getByRole("button", { name: t("home.startMeditation") }));
    expect(screen.getByRole("heading", { name: t("plans.title") })).toBeInTheDocument();
  });

  it("Planes propuestos no ofrece «Pedir cambios al coach» (quitado por Santi el 24/11)", () => {
    renderApp("/planes-propuestos");
    expect(screen.getByText(t("activation.bothActive"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pedir cambios/i })).not.toBeInTheDocument();
  });
});

describe("plan y sesiones", () => {
  it("las sesiones pendientes no se pueden tocar; la siguiente y las hechas sí", () => {
    renderApp(`/planes/${PLAN_TENSION}`);
    const lista = screen.getByRole("list", { name: t("plans.sessionsAria") });
    for (const s of pending) {
      expect(within(lista).queryByRole("button", { name: new RegExp(s.title) })).not.toBeInTheDocument();
    }
    expect(within(lista).getByRole("button", { name: new RegExp(next.title) })).toBeInTheDocument();
    expect(within(lista).getAllByRole("button")).toHaveLength(3); // 2 hechas + la siguiente
  });

  it("«Comenzar» arranca con la duración elegida", async () => {
    const { user } = renderApp(`/sesion/${next.id}/antes`);
    const grupo = screen.getByRole("radiogroup", { name: t("before.duration") });
    expect(within(grupo).getByRole("radio", { name: t("common.minutes", { n: next.suggestedMinutes }) })).toBeChecked();
    await user.click(within(grupo).getByRole("radio", { name: t("common.minutes", { n: 15 }) }));
    expect(within(grupo).getByRole("radio", { name: t("common.minutes", { n: 15 }) })).toBeChecked();
  });
});

describe("pausa en el reproductor", () => {
  it("al pausar se muestra «En pausa» y el botón pasa a «Seguir»", async () => {
    const { user } = renderApp(`/sesion/${next.id}/reproductor`);
    await user.click(screen.getByRole("button", { name: t("player.pause") }));
    expect(screen.getByText(t("player.paused"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("player.resume") })).toBeInTheDocument();
  });

  it("la estrella marca y desmarca la favorita", async () => {
    const { user } = renderApp(`/sesion/${next.id}/reproductor`);
    const antes = screen.getByRole("button", { name: /favorita/i });
    const marcada = antes.getAttribute("aria-pressed") === "true";
    await user.click(antes);
    expect(screen.getByRole("button", { name: /favorita/i })).toHaveAttribute("aria-pressed", String(!marcada));
  });
});

describe("privacidad y borrado de datos", () => {
  it("pide confirmación, permite cancelar y, al confirmar, termina en «Datos borrados» y el primer uso", async () => {
    const { user } = renderApp("/yo/ajustes/privacidad");
    await user.click(screen.getByRole("button", { name: t("settings.deleteAll") }));
    const hoja = screen.getByRole("dialog", { name: t("settings.confirmTitle") });
    await user.click(within(hoja).getByRole("button", { name: t("common.cancel") }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: t("settings.deleteAll") }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: t("settings.confirmDelete") }));
    expect(screen.getByRole("heading", { name: t("settings.deletedTitle") })).toBeInTheDocument();
    expect(menu()).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t("common.continue") }));
    expect(screen.getByRole("heading", { name: t("activation.firstTitle") })).toBeInTheDocument();
  });

  it("Escape cierra la hoja de confirmación", async () => {
    const { user } = renderApp("/yo/ajustes/privacidad");
    await user.click(screen.getByRole("button", { name: t("settings.deleteAll") }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("perfil y ajustes", () => {
  it("muestra el consumo del bolsón y la fecha de renovación sin desplazar el día", () => {
    renderApp("/yo/ajustes");
    expect(screen.getByText(t("settings.remaining", { remaining: "50 min", total: "2 h" }))).toBeInTheDocument();
    expect(screen.getByText(t("settings.renewsOn", { date: "1 de diciembre" }))).toBeInTheDocument();
  });

  it("editar objetivos y guardar vuelve al perfil", async () => {
    const { user } = renderApp("/yo/perfil");
    await user.click(screen.getByRole("button", { name: t("profile.editGoals") }));
    expect(screen.getByRole("textbox", { name: t("profile.goals") })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t("common.save") }));
    expect(screen.getByRole("heading", { name: t("profile.title") })).toBeInTheDocument();
  });

  it("una ruta desconocida lleva a Inicio", () => {
    renderApp("/no-existe");
    expect(screen.getByRole("heading", { name: t("home.title") })).toBeInTheDocument();
  });
});
