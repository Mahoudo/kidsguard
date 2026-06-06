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

/** Multi-guardian: invite another adult to follow this family. */
export async function createGuardianInvite(): Promise<string> {
  const familyId = await ensureFamily();
  const { data, error } = await supabase.rpc("create_guardian_invite", {
    p_family: familyId,
  });
  if (error) throw error;
  return data as string;
}

/** Join an existing family as a guardian via an invite code. */
export async function redeemGuardianInvite(code: string): Promise<void> {
  const { error } = await supabase.rpc("redeem_guardian_invite", { p_code: code });
  if (error) throw error;
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
  locked?: boolean;
}

/** Parent: lock or unlock a child device remotely. */
export async function setChildLock(childId: string, locked: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_child_lock", {
    p_child: childId,
    p_locked: locked,
  });
  if (error) throw error;
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

/** Build a unique Jitsi room name for a child. */
export function callRoom(childId: string): string {
  return `KidsGuard-${childId.replace(/-/g, "").slice(0, 12)}-${Date.now().toString(36)}`;
}

/** Start a consented video call: notify the child + return the Jitsi room. */
export async function startCall(childId: string): Promise<string> {
  const room = callRoom(childId);
  const { error } = await supabase
    .from("commands")
    .insert({ child_id: childId, type: "call", payload: { room } });
  if (error) throw error;
  return room;
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

export interface UsageDay {
  day: string;
  total_ms: number;
}

// ---- App limits + focus schedules -----------------------------------------

export interface Focus {
  study_enabled: boolean;
  study_start: string | null;
  study_end: string | null;
  sleep_enabled: boolean;
  sleep_start: string | null;
  sleep_end: string | null;
}

export async function getFocus(childId: string): Promise<Focus | null> {
  const { data, error } = await supabase.rpc("get_focus", { p_child: childId });
  if (error) throw error;
  return ((data as Focus[])?.[0]) ?? null;
}

export async function setFocus(childId: string, f: Focus): Promise<void> {
  const { error } = await supabase.rpc("set_focus", {
    p_child: childId,
    p_study_enabled: f.study_enabled,
    p_study_start: f.study_start,
    p_study_end: f.study_end,
    p_sleep_enabled: f.sleep_enabled,
    p_sleep_start: f.sleep_start,
    p_sleep_end: f.sleep_end,
  });
  if (error) throw error;
}

export interface AppLimit {
  package: string;
  app_name: string;
  limit_min: number | null;
  blocked: boolean;
}

export async function listAppLimits(childId: string): Promise<AppLimit[]> {
  const { data, error } = await supabase.rpc("list_app_limits", { p_child: childId });
  if (error) throw error;
  return (data ?? []) as AppLimit[];
}

export async function setAppLimit(
  childId: string,
  pkg: string,
  appName: string,
  limitMin: number | null,
  blocked: boolean
): Promise<void> {
  const { error } = await supabase.rpc("set_app_limit", {
    p_child: childId,
    p_package: pkg,
    p_app_name: appName,
    p_limit: limitMin,
    p_blocked: blocked,
  });
  if (error) throw error;
}

/** Daily screen-time totals over a date range (for weekly summaries). */
export async function fetchUsageRange(
  childId: string,
  from: string,
  to: string
): Promise<UsageDay[]> {
  const { data, error } = await supabase.rpc("usage_range", {
    p_child: childId,
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return (data ?? []) as UsageDay[];
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
