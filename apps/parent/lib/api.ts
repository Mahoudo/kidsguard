import type { Child } from "@kidsguard/shared";
import { supabase } from "./supabase";

/** Get the parent's family, creating one on first use. */
export async function ensureFamily(): Promise<string> {
  const { data: existing, error } = await supabase
    .from("families")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing.id;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non connecté");

  const { data: created, error: insErr } = await supabase
    .from("families")
    .insert({ owner_id: user.id })
    .select("id")
    .single();
  if (insErr) throw insErr;
  return created.id;
}

/** Create a child + return it (with pairing_code to display). */
export async function createChild(name: string): Promise<Child> {
  const familyId = await ensureFamily();
  const { data, error } = await supabase.rpc("create_child", {
    p_family: familyId,
    p_name: name,
  });
  if (error) throw error;
  return data as Child;
}

export interface ChildWithLocation {
  id: string;
  name: string;
  avatar_url: string | null;
  pairing_code: string | null;
  last_battery_pct: number | null;
  last_seen_at: string | null;
  lng: number | null;
  lat: number | null;
  accuracy_m: number | null;
  located_at: string | null;
}

/** Children + their latest known location (lng/lat decoded server-side). */
export async function fetchChildren(): Promise<ChildWithLocation[]> {
  const { data, error } = await supabase.rpc("children_overview");
  if (error) throw error;
  return (data ?? []) as ChildWithLocation[];
}

/** Realtime: fire onChange whenever any location row is inserted. */
export function subscribeLocations(onChange: () => void) {
  const channel = supabase
    .channel("locations-stream")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "locations" },
      () => onChange()
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/** Send a command (ring, locate_now) to a child device. */
export async function sendCommand(
  childId: string,
  type: "ring" | "locate_now" | "stop_ring"
) {
  const { error } = await supabase
    .from("commands")
    .insert({ child_id: childId, type });
  if (error) throw error;
}

// ---- Geofencing -----------------------------------------------------------

export interface PlaceOverview {
  id: string;
  name: string;
  kind: "home" | "school" | "other";
  lng: number;
  lat: number;
  radius_m: number;
}

export async function fetchPlaces(): Promise<PlaceOverview[]> {
  const { data, error } = await supabase.rpc("places_overview");
  if (error) throw error;
  return (data ?? []) as PlaceOverview[];
}

export async function createPlace(input: {
  name: string;
  kind: "home" | "school" | "other";
  lng: number;
  lat: number;
  radiusM: number;
}): Promise<string> {
  const familyId = await ensureFamily();
  const { data, error } = await supabase.rpc("create_place", {
    p_family: familyId,
    p_name: input.name,
    p_kind: input.kind,
    p_lng: input.lng,
    p_lat: input.lat,
    p_radius: input.radiusM,
  });
  if (error) throw error;
  return data as string;
}

export interface GeofenceEvent {
  id: number;
  child_id: string;
  child_name: string;
  place_name: string;
  direction: "enter" | "exit";
  occurred_at: string;
}

export async function fetchGeofenceFeed(limit = 50): Promise<GeofenceEvent[]> {
  const { data, error } = await supabase.rpc("geofence_feed", {
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as GeofenceEvent[];
}

/** Realtime: fire on every new geofence transition. */
export function subscribeGeofence(onChange: () => void) {
  const channel = supabase
    .channel("geofence-stream")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "geofence_events" },
      () => onChange()
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// ---- SOS ------------------------------------------------------------------

export interface SosEvent {
  id: string;
  child_id: string;
  child_name: string;
  lng: number;
  lat: number;
  battery_pct: number | null;
  created_at: string;
  resolved_at: string | null;
}

export async function fetchSos(limit = 20): Promise<SosEvent[]> {
  const { data, error } = await supabase.rpc("sos_feed", { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as SosEvent[];
}

export async function resolveSos(id: string): Promise<void> {
  const { error } = await supabase.rpc("resolve_sos", { p_id: id });
  if (error) throw error;
}

export function subscribeSos(onChange: () => void) {
  const channel = supabase
    .channel("sos-stream")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "sos_alerts" },
      () => onChange()
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
