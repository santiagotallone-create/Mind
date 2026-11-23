import { z } from "zod";
import { IsoDateTimeSchema, LocalDateSchema } from "./common.js";

/** GET /v1/quota. El saldo exacto solo se muestra en Ajustes, nunca en la charla. */
export const QuotaStatusSchema = z.object({
  /** sin_iniciar: no hay periodo abierto (nunca hubo charla o el último venció); saldo completo y sin fecha de renovación. */
  state: z.enum(["sin_iniciar", "disponible", "agotado"]),
  secondsTotal: z.number().int().nonnegative(),
  secondsRemaining: z.number().int().nonnegative(),
  /** Minutos restantes redondeados hacia abajo, para mostrar. */
  minutesRemaining: z.number().int().nonnegative(),
  periodStartsAt: IsoDateTimeSchema.nullable(),
  /** Fecha explícita de renovación en la zona horaria del usuario. La app la formatea; nunca «el mes próximo». */
  renewsOn: LocalDateSchema.nullable(),
});

export type QuotaStatus = z.infer<typeof QuotaStatusSchema>;
