import { getStoredChildId } from "./pairing";
import { supabase } from "./supabase";
import {
  getUsageToday,
  hasUsagePermission,
  openUsageAccessSettings,
} from "../modules/screen-time";

export { hasUsagePermission, openUsageAccessSettings };

/** Read today's per-app usage from the OS and push it to Supabase. */
export async function syncUsage(): Promise<number> {
  const childId = await getStoredChildId();
  if (!childId) return 0;
  try {
    if (!hasUsagePermission()) return 0;
    const usage = await getUsageToday();
    if (!usage.length) return 0;
    const items = usage.slice(0, 50).map((u) => ({
      package: u.packageName,
      app_name: u.appName,
      total_ms: u.totalMs,
    }));
    const day = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.rpc("upsert_usage", {
      p_child: childId,
      p_day: day,
      p_items: items,
    });
    if (error) console.warn("upsert_usage failed", error.message);
    return usage.length;
  } catch (e: any) {
    console.warn("syncUsage failed", e?.message);
    return 0;
  }
}
