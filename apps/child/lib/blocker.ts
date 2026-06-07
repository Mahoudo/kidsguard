import { getStoredChildId } from "./pairing";
import { supabase } from "./supabase";
import {
  isAccessibilityEnabled,
  openAccessibilitySettings,
  isAdminActive,
  requestAdmin,
  isBatteryUnrestricted,
  requestDisableBatteryOptimization,
  lockNow,
  setBlockRules,
} from "../modules/screen-time";

export {
  isAccessibilityEnabled,
  openAccessibilitySettings,
  isAdminActive,
  requestAdmin,
  isBatteryUnrestricted,
  requestDisableBatteryOptimization,
  lockNow,
};

/** Fetch blocked apps + focus windows + lock state, push them to the native
 *  accessibility service (which enforces them). */
export async function syncBlockRules(): Promise<void> {
  const childId = await getStoredChildId();
  if (!childId) return;
  try {
    const [limitsRes, focusRes, childRes, pauseRes] = await Promise.all([
      supabase.from("app_limits").select("package,blocked").eq("child_id", childId),
      supabase.rpc("my_focus"),
      supabase.from("children").select("locked").eq("id", childId).maybeSingle(),
      supabase.rpc("my_pause", { p_child: childId }),
    ]);

    // An active, parent-granted pause suspends all enforcement.
    const pausedUntil = pauseRes.data ? new Date(pauseRes.data as string).getTime() : 0;
    if (pausedUntil > Date.now()) {
      setBlockRules({
        packages: [],
        studyEnabled: false,
        studyStart: null,
        studyEnd: null,
        sleepEnabled: false,
        sleepStart: null,
        sleepEnd: null,
        locked: false,
      });
      return;
    }

    const packages = (limitsRes.data ?? [])
      .filter((l: any) => l.blocked)
      .map((l: any) => l.package as string);
    const f: any = (focusRes.data as any[])?.[0] ?? {};
    const isLocked = !!(childRes.data as any)?.locked;
    setBlockRules({
      packages,
      studyEnabled: !!f.study_enabled,
      studyStart: f.study_start ?? null,
      studyEnd: f.study_end ?? null,
      sleepEnabled: !!f.sleep_enabled,
      sleepStart: f.sleep_start ?? null,
      sleepEnd: f.sleep_end ?? null,
      locked: isLocked,
    });
    // Real screen lock when the parent locked the device (needs device admin).
    if (isLocked) lockNow();
  } catch (e: any) {
    console.warn("syncBlockRules failed", e?.message);
  }
}
