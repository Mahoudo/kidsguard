import * as Location from "expo-location";
import { getStoredChildId } from "./pairing";
import { supabase } from "./supabase";

export type Mood = "happy" | "ok" | "sad";

/** Child taps "I'm safe / I arrived" — instant, uses last known position. */
export async function sendCheckin(
  kind: "safe" | "arrived",
  mood?: Mood
): Promise<void> {
  const childId = await getStoredChildId();
  if (!childId) return;
  const pos = await Location.getLastKnownPositionAsync().catch(() => null);
  const { error } = await supabase.rpc("send_checkin", {
    p_child: childId,
    p_kind: kind,
    p_mood: mood ?? null,
    p_lng: pos?.coords.longitude ?? null,
    p_lat: pos?.coords.latitude ?? null,
  });
  if (error) throw error;
}
