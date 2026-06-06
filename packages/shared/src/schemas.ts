import { z } from "zod";

// ---- Domain enums -----------------------------------------------------------
export const PlaceKind = z.enum(["home", "school", "other"]);
export type PlaceKind = z.infer<typeof PlaceKind>;

export const CommandType = z.enum(["ring", "locate_now", "stop_ring"]);
export type CommandType = z.infer<typeof CommandType>;

export const CommandStatus = z.enum(["pending", "acked", "done", "expired"]);
export type CommandStatus = z.infer<typeof CommandStatus>;

// ---- Coordinates ------------------------------------------------------------
export const Coord = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type Coord = z.infer<typeof Coord>;

// ---- Location ping (child -> server) ---------------------------------------
export const LocationPing = Coord.extend({
  accuracy: z.number().nonnegative().optional(),
  battery: z.number().int().min(0).max(100).optional(),
  isMoving: z.boolean().optional(),
  recordedAt: z.string().datetime().optional(),
});
export type LocationPing = z.infer<typeof LocationPing>;

// ---- Pairing ----------------------------------------------------------------
export const PairingCode = z
  .string()
  .regex(/^\d{6}$/, "Le code doit faire 6 chiffres");
export type PairingCode = z.infer<typeof PairingCode>;

// ---- Place (geofence) -------------------------------------------------------
export const PlaceInput = z.object({
  name: z.string().min(1).max(60),
  kind: PlaceKind.default("other"),
  center: Coord,
  radiusM: z.number().int().min(50).max(5000).default(150),
});
export type PlaceInput = z.infer<typeof PlaceInput>;

// ---- Child creation ---------------------------------------------------------
export const ChildInput = z.object({
  name: z.string().min(1).max(60),
  avatarUrl: z.string().url().optional(),
  birthDate: z.string().date().optional(),
});
export type ChildInput = z.infer<typeof ChildInput>;
