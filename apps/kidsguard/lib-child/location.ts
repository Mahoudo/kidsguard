import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Battery from "expo-battery";
import { supabase } from "./supabase";
import { getStoredChildId } from "./pairing";
import { syncBlockRules } from "./blocker";

export const LOCATION_TASK = "kidsguard-location";

// Background task: push every received location to the backend AND refresh the
// block rules. The foreground service keeps this firing (~60s) even when the
// child app is closed, so a parent's block/lock takes effect without the child
// reopening the app.
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  syncBlockRules().catch(() => {}); // keep enforcement fresh in the background
  const { locations } = (data ?? {}) as { locations?: Location.LocationObject[] };
  const childId = await getStoredChildId();
  if (!childId || !locations?.length) return;

  const level = await Battery.getBatteryLevelAsync();
  const battery = level >= 0 ? Math.round(level * 100) : null;

  for (const loc of locations) {
    const { error: rpcError } = await supabase.rpc("ingest_location", {
      p_child: childId,
      p_lng: loc.coords.longitude,
      p_lat: loc.coords.latitude,
      p_accuracy: loc.coords.accuracy ?? null,
      p_battery: battery,
      p_is_moving: (loc.coords.speed ?? 0) > 0.5,
      p_recorded_at: new Date(loc.timestamp).toISOString(),
    });
    if (rpcError) console.warn("ingest_location failed", rpcError.message);
  }
});

/** Fetch the current position once and push it immediately. */
export async function sendCurrentPosition(): Promise<void> {
  const childId = await getStoredChildId();
  if (!childId) return;
  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const level = await Battery.getBatteryLevelAsync();
    const battery = level >= 0 ? Math.round(level * 100) : null;
    const { error } = await supabase.rpc("ingest_location", {
      p_child: childId,
      p_lng: pos.coords.longitude,
      p_lat: pos.coords.latitude,
      p_accuracy: pos.coords.accuracy ?? null,
      p_battery: battery,
      p_is_moving: false,
      p_recorded_at: new Date(pos.timestamp).toISOString(),
    });
    if (error) console.warn("sendCurrentPosition ingest failed", error.message);
  } catch (e: any) {
    console.warn("sendCurrentPosition failed", e?.message);
  }
}

// distanceInterval 0 => the OS delivers a point every `timeInterval` even when
// the child is perfectly still. That steady 60s ping is the "online" heartbeat:
// the parent sees the device connected as long as the app runs, not only when
// the child moves. The persistent foreground-service notification keeps the
// process alive across backgrounding (Family-Link style).
const TRACK_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: 60_000,
  distanceInterval: 0,
  pausesUpdatesAutomatically: false,
  showsBackgroundLocationIndicator: true,
  foregroundService: {
    notificationTitle: "KidsGuard actif",
    notificationBody: "Connecté avec tes parents",
  },
};

export async function startTracking(): Promise<void> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") {
    throw new Error("Permission de localisation refusée");
  }
  // Background permission may be limited/deferred on some OS — best effort.
  await Location.requestBackgroundPermissionsAsync();

  // Push one position right away so the parent sees the child immediately.
  await sendCurrentPosition();

  const already = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  if (already) return;

  await Location.startLocationUpdatesAsync(LOCATION_TASK, TRACK_OPTIONS);
}

/**
 * Called on every app launch: silently (re)start the foreground heartbeat if
 * permission is already granted — no prompt. Keeps the child "connecté" after
 * the app is reopened or relaunched by the OS, without user action.
 */
export async function ensureTracking(): Promise<void> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") return;
    await sendCurrentPosition();
    const already = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
    if (!already) {
      await Location.startLocationUpdatesAsync(LOCATION_TASK, TRACK_OPTIONS);
    }
  } catch (e: any) {
    console.warn("ensureTracking failed", e?.message);
  }
}

export async function stopTracking(): Promise<void> {
  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  if (started) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
}

export async function isTracking(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
}
