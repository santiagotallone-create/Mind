import { z } from "zod";
import { clampSpeed } from "../config.js";
import { CoachToolsSchema, type CoachTool } from "../contract/index.js";
import type { ToolDefinition } from "../voice/provider.js";

export type CoachToolName = CoachTool["name"];
type ArgsOf<N extends CoachToolName> = Extract<CoachTool, { name: N }>["arguments"];

/** Qué hace el coach con cada herramienta. Lo que el coach lee para decidir cuándo usarla. */
const DESCRIPTIONS: Record<CoachToolName, string> = {
  ajustar_velocidad:
    "Cambia la velocidad de tu propia voz cuando la persona pide que hables más lento o más rápido. " +
    "1 es la velocidad normal; un valor menor es más lento. Cambia de a 0.1 o 0.15 respecto de la velocidad actual.",
  crear_plan: "Crea un plan de meditaciones para la persona, con el nombre, una descripción y sus sesiones.",
  ajustar_plan: "Ajusta un plan existente de la persona según el motivo que ella te dio.",
  guardar_perfil:
    "Guarda lo que la persona te contó sobre sí misma: sus objetivos, su experiencia con la meditación y cómo está ahora. " +
    "Envía solo los campos que aprendiste; no inventes ninguno.",
  marcar_entrevista_completa: "Marca que ya terminaste la entrevista inicial con la persona.",
};

type Handlers = { [N in CoachToolName]?: (args: ArgsOf<N>) => Promise<unknown> };

export interface CoachToolRuntime {
  /** Lo que se le ofrece al motor de voz. */
  definitions: ToolDefinition[];
  /** Nombres de las herramientas ofrecidas, para que el prompt sepa qué puede y qué no puede hacer el coach. */
  enabled: CoachToolName[];
  /** Ejecuta una llamada del coach. Nunca lanza: devuelve un resultado que el coach puede leer. */
  handle(call: { name: string; arguments: string }): Promise<unknown>;
}

function argumentsSchemaOf(name: CoachToolName): z.ZodType {
  const option = CoachToolsSchema.options.find((o) => o.shape.name.value === name);
  if (!option) throw new Error(`Herramienta sin esquema: ${name}`);
  return option.shape.arguments;
}

/**
 * Solo se ofrecen al coach las herramientas que tienen quién las ejecute. Así no promete nada que todavía no puede hacer:
 * `crear_plan` y `ajustar_plan` están en el contrato, pero se activan con las Olas 2 y 3.
 */
export function createCoachTools(handlers: Handlers): CoachToolRuntime {
  const enabled = (Object.keys(handlers) as CoachToolName[]).filter((name) => handlers[name]);

  const definitions = enabled.map((name): ToolDefinition => {
    const { $schema: _ignored, ...parameters } = z.toJSONSchema(argumentsSchemaOf(name)) as Record<string, unknown>;
    return { name, description: DESCRIPTIONS[name], parameters };
  });

  return {
    definitions,
    enabled,
    async handle(call) {
      const name = call.name as CoachToolName;
      const handler = handlers[name] as ((args: unknown) => Promise<unknown>) | undefined;
      if (!enabled.includes(name) || !handler) return { ok: false, error: "herramienta_no_disponible" };

      let raw: unknown;
      try {
        raw = JSON.parse(call.arguments || "{}");
      } catch {
        return { ok: false, error: "argumentos_invalidos" };
      }
      // El coach a veces pide una velocidad fuera de rango: se acota en lugar de rechazarla.
      if (name === "ajustar_velocidad" && raw && typeof raw === "object" && typeof (raw as any).velocidad === "number") {
        (raw as any).velocidad = clampSpeed((raw as any).velocidad);
      }
      const parsed = CoachToolsSchema.safeParse({ name, arguments: raw });
      if (!parsed.success) return { ok: false, error: "argumentos_invalidos" };
      try {
        return await handler(parsed.data.arguments);
      } catch {
        return { ok: false, error: "error_de_herramienta" };
      }
    },
  };
}
