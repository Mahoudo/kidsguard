// Hand-written domain row types (mirror of DB tables).
// Replace/augment with generated types via `pnpm db:types` once linked.
import type { CommandStatus, CommandType, PlaceKind } from "./schemas";

export interface Family {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
}

export interface Child {
  id: string;
  family_id: string;
  name: string;
  avatar_url: string | null;
  birth_date: string | null;
  pairing_code: string | null;
  paired_at: string | null;
  last_battery_pct: number | null;
  last_seen_at: string | null;
  created_at: string;
}

export interface LocationRow {
  id: number;
  child_id: string;
  // GeoJSON-ish: server stores geography; client receives lng/lat after select
  accuracy_m: number | null;
  battery_pct: number | null;
  is_moving: boolean | null;
  recorded_at: string;
}

export interface Place {
  id: string;
  family_id: string;
  name: string;
  kind: PlaceKind;
  radius_m: number;
  created_at: string;
}

export interface Command {
  id: string;
  child_id: string;
  type: CommandType;
  status: CommandStatus;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SosAlert {
  id: string;
  child_id: string;
  battery_pct: number | null;
  resolved_at: string | null;
  created_at: string;
}
