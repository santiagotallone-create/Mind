import type { QuotaStatus } from "../contract/index.js";
import { ApiError } from "../server/errors.js";
import type { DataStore, QuotaPeriod, UsageByType } from "../store/types.js";
import { addOneMonth, localDate, safeTimeZone } from "./period.js";

/** 120 minutos por periodo. */
export const QUOTA_SECONDS_TOTAL = 7200;

export interface QuotaServiceDeps {
  store: DataStore;
  clock?: () => Date;
  secondsTotal?: number;
}

/**
 * Reglas del bolsón (docs/arquitectura.md):
 * - El periodo empieza en la primera charla activa y dura 1 mes, sin fecha fija del calendario.
 * - Al vencer, el bolsón vuelve a estar completo y el siguiente periodo empieza en la siguiente primera charla.
 * - Sin periodo abierto el estado es `sin_iniciar`.
 */
export class QuotaService {
  private readonly store: DataStore;
  private readonly clock: () => Date;
  private readonly secondsTotal: number;

  constructor(deps: QuotaServiceDeps) {
    this.store = deps.store;
    this.clock = deps.clock ?? (() => new Date());
    this.secondsTotal = deps.secondsTotal ?? QUOTA_SECONDS_TOTAL;
  }

  async getStatus(userId: string): Promise<QuotaStatus> {
    const now = this.clock();
    const period = await this.store.getOpenPeriod(userId, now);
    if (!period) {
      return {
        state: "sin_iniciar",
        secondsTotal: this.secondsTotal,
        secondsRemaining: this.secondsTotal,
        minutesRemaining: Math.floor(this.secondsTotal / 60),
        periodStartsAt: null,
        renewsOn: null,
      };
    }
    const timeZone = await this.timeZoneOf(userId);
    const secondsRemaining = Math.max(0, period.secondsTotal - period.secondsUsed);
    return {
      state: secondsRemaining === 0 ? "agotado" : "disponible",
      secondsTotal: period.secondsTotal,
      secondsRemaining,
      minutesRemaining: Math.floor(secondsRemaining / 60),
      periodStartsAt: period.startsAt.toISOString(),
      renewsOn: localDate(period.endsAt, timeZone),
    };
  }

  /** Bloqueo del servidor: con el saldo en cero no se abren charlas nuevas, sin importar lo que haga la app. */
  async assertCanStart(userId: string): Promise<QuotaStatus> {
    const status = await this.getStatus(userId);
    if (status.state === "agotado") {
      throw new ApiError("quota_exhausted", "Se agotó el tiempo de coach de este periodo.");
    }
    return status;
  }

  /**
   * Se llama en el primer segundo activo de una charla (evento `ready`).
   * Devuelve el periodo abierto; si no hay, abre uno nuevo que vence un mes después.
   */
  async activate(userId: string): Promise<QuotaPeriod> {
    const now = this.clock();
    const timeZone = await this.timeZoneOf(userId);
    return this.store.openPeriod({
      userId,
      now,
      endsAt: addOneMonth(now, timeZone),
      secondsTotal: this.secondsTotal,
    });
  }

  /**
   * Descuenta el tiempo activo de una charla del periodo en que empezó. Se puede repetir sin riesgo:
   * solo se descuenta lo nuevo y el saldo nunca queda en negativo.
   */
  async chargeTalk(input: { talkId: string; periodId: string; activeSeconds: number }): Promise<{ secondsRemaining: number }> {
    const period = await this.store.chargeTalk({
      talkId: input.talkId,
      periodId: input.periodId,
      activeSeconds: Math.max(0, Math.floor(input.activeSeconds)),
    });
    return { secondsRemaining: Math.max(0, period.secondsTotal - period.secondsUsed) };
  }

  /** Consumo del periodo por tipo de charla, para decidir si hay que acortar alguna. */
  usageByType(userId: string, periodId: string): Promise<UsageByType[]> {
    return this.store.usageByType(userId, periodId);
  }

  private async timeZoneOf(userId: string): Promise<string> {
    const user = await this.store.getUser(userId);
    return safeTimeZone(user?.timezone);
  }
}
