import * as Location from "expo-location";
import * as Battery from "expo-battery";
import { supabase } from "./supabase";

/**
 * Raise an SOS as fast as possible. SOS is time-critical, so we use the LAST
 * KNOWN position (instant) instead of waiting for a fresh GPS fix. If there is
 * no cached position, fall back to a quick low-accuracy fix with a short timeout.
 */
export async function raiseSos(childId: string): Promise<void> {
  let pos = await Location.getLastKnownPositionAsync().catch(() => null);

  if (!pos) {
    try {
      pos = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
        new Promise<null>((res) => setTimeout(() => res(null), 4000)),
      ]);
    } catch {
      pos = null;
    }
  }

  const level = await Battery.getBatteryLevelAsync().catch(() => -1);
  const battery = level >= 0 ? Math.round(level * 100) : null;

  const { error } = await supabase.rpc("raise_sos", {
    p_child: childId,
    p_lng: pos?.coords.longitude ?? 0,
    p_lat: pos?.coords.latitude ?? 0,
    p_battery: battery,
  });
  if (error) throw error;

  // Best-effort: push a fresh precise position in the background (non-blocking).
  // Uses ingest_location (updates the child's position) — NOT a 2nd SOS.
  Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    .then((fresh) =>
      supabase.rpc("ingest_location", {
        p_child: childId,
        p_lng: fresh.coords.longitude,
        p_lat: fresh.coords.latitude,
        p_accuracy: fresh.coords.accuracy ?? null,
        p_battery: battery,
        p_is_moving: false,
        p_recorded_at: new Date(fresh.timestamp).toISOString(),
      })
    )
    .catch(() => {});
}
