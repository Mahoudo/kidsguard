import { getStoredChildId } from "./pairing";
import { supabase } from "./supabase";
import {
  isAccessibilityEnabled,
  openAccessibilitySettings,
  isAdminActive,
  requestAdmin,
  setBlockRules,
} from "../modules/screen-time";

export { isAccessibilityEnabled, openAccessibilitySettings, isAdminActive, requestAdmin };

/** Fetch blocked apps + focus windows + lock state, push them to the native
 *  accessibility service (which enforces them). */
export async function syncBlockRules(): Promise<void> {
  const childId = await getStoredChildId();
  if (!childId) return;
  try {
    const [limitsRes, focusRes, childRes] = await Promise.all([
      supabase.from("app_limits").select("package,blocked").eq("child_id", childId),
      supabase.rpc("my_focus"),
      supabase.from("children").select("locked").eq("id", childId).maybeSingle(),
    ]);
    const packages = (limitsRes.data ?? [])
      .filter((l: any) => l.blocked)
      .map((l: any) => l.package as string);
    const f: any = (focusRes.data as any[])?.[0] ?? {};
    setBlockRules({
      packages,
      studyEnabled: !!f.study_enabled,
      studyStart: f.study_start ?? null,
      studyEnd: f.study_end ?? null,
      sleepEnabled: !!f.sleep_enabled,
      sleepStart: f.sleep_start ?? null,
      sleepEnd: f.sleep_end ?? null,
      locked: !!(childRes.data as any)?.locked,
    });
  } catch (e: any) {
    console.warn("syncBlockRules failed", e?.message);
  }
}
