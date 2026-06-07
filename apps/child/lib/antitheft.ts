import { getSimInfo } from "../modules/screen-time";
import { getStoredChildId } from "./pairing";
import { supabase } from "./supabase";

/** Report the current SIM identity; the server alerts the parent on a change. */
export async function reportSim(): Promise<void> {
  try {
    const childId = await getStoredChildId();
    if (!childId) return;
    const sim = getSimInfo();
    if (!sim) return;
    await supabase.rpc("report_sim", { p_child: childId, p_sim: sim });
  } catch (e: any) {
    console.warn("reportSim failed", e?.message);
  }
}
