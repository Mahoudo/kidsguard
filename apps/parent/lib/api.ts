import type { Child } from "@kidsguard/shared";
import { supabase } from "./supabase";

// Monotonic counter so each realtime channel gets a UNIQUE name. Reusing a
// fixed name can return an already-subscribed channel, and calling .on() on it
// throws "cannot add postgres_changes callbacks after subscribe()" (crashes app).
let channelSeq = 0;

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

/** Family emergency phone (used by the child for offline SOS-by-SMS). */
export async function setEmergencyPhone(phone: string): Promise<void> {
  const familyId = await ensureFamily();
  const { error } = await supabase.rpc("set_emergency_phone", {
    p_family: familyId,
    p_phone: phone,
  });
  if (error) throw error;
}

export async function getEmergencyPhone(): Promise<string | null> {
  const familyId = await ensureFamily();
  const { data, error } = await supabase.rpc("get_emergency_phone", {
    p_family: familyId,
  });
  if (error) throw error;
  return (data as string) ?? null;
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
    .channel(`locations-stream-${++channelSeq}`)
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

export interface TrackPoint {
  lng: number;
  lat: number;
  accuracy_m: number | null;
  recorded_at: string;
}

/** Location history for one child (newest first). */
export async function fetchChildTrack(
  childId: string,
  limit = 50
): Promise<TrackPoint[]> {
  const { data, error } = await supabase.rpc("child_track", {
    p_child: childId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as TrackPoint[];
}

export interface UsageRow {
  package: string;
  app_name: string;
  total_ms: number;
}

/** A child's per-app screen time for today (most used first). */
export async function fetchUsage(childId: string): Promise<UsageRow[]> {
  const { data, error } = await supabase.rpc("usage_for_child", {
    p_child: childId,
  });
  if (error) throw error;
  return (data ?? []) as UsageRow[];
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
    .channel(`geofence-stream-${++channelSeq}`)
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
    .channel(`sos-stream-${++channelSeq}`)
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

// ---- Check-ins ("I'm safe") ----------------------------------------------

export interface CheckinEvent {
  id: number;
  child_id: string;
  child_name: string;
  kind: string; // 'safe' | 'arrived'
  mood: string | null; // 'happy' | 'ok' | 'sad'
  created_at: string;
}

export async function fetchCheckins(limit = 50): Promise<CheckinEvent[]> {
  const { data, error } = await supabase.rpc("checkins_feed", { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as CheckinEvent[];
}

export function subscribeCheckins(onChange: () => void) {
  const channel = supabase
    .channel(`checkins-stream-${++channelSeq}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "checkins" },
      () => onChange()
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
