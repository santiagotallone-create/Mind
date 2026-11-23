import { z } from "zod";
import { IsoDateTimeSchema, LanguageSchema } from "./common.js";

export const ExperienceSchema = z.enum(["principiante", "algo_practica", "mucha_practica"]);

/** GET /v1/profile. Lo arma el coach en la entrevista; el usuario puede corregirlo. */
export const ProfileSchema = z.object({
  goals: z.string(),
  experience: ExperienceSchema.nullable(),
  currentState: z.string(),
  interviewCompletedAt: IsoDateTimeSchema.nullable(),
});

/** PATCH /v1/profile: solo los campos que el usuario edita. */
export const UpdateProfileRequestSchema = z
  .object({
    goals: z.string().max(1000),
    experience: ExperienceSchema,
    currentState: z.string().max(1000),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Debe incluir al menos un campo" });

/** GET/PATCH /v1/settings */
export const SettingsSchema = z.object({
  locale: LanguageSchema,
  timezone: z.string().min(1),
  voiceSpeed: z.number().min(0.5).max(1.5),
});

export const UpdateSettingsRequestSchema = SettingsSchema.partial().refine((v) => Object.keys(v).length > 0, {
  message: "Debe incluir al menos un campo",
});

/** DELETE /v1/me/data: borra todo el contenido del usuario, incluidos los audios. No se puede deshacer. */
export const DeleteDataResponseSchema = z.object({
  deleted: z.literal(true),
  deletedAt: IsoDateTimeSchema,
});

export type Profile = z.infer<typeof ProfileSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
