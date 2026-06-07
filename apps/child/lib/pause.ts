import { getStoredChildId } from "./pairing";
import { supabase } from "./supabase";

/** Child asks the parent for a pause of blocking/focus (transparent request). */
export async function requestPause(minutes = 15): Promise<void> {
  const childId = await getStoredChildId();
  if (!childId) throw new Error("Appareil non associé");
  const { error } = await supabase.rpc("request_pause", {
    p_child: childId,
    p_minutes: minutes,
  });
  if (error) throw error;
}

/** Active pause end time (ms epoch) or null. */
export async function getPauseUntil(): Promise<number | null> {
  const childId = await getStoredChildId();
  if (!childId) return null;
  const { data } = await supabase.rpc("my_pause", { p_child: childId });
  return data ? new Date(data as string).getTime() : null;
}
