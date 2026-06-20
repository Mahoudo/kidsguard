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
  isAggressiveOem,
  openAutostartSettings,
} from "../modules/screen-time";

export {
  isAccessibilityEnabled,
  openAccessibilitySettings,
  isAdminActive,
  requestAdmin,
  isBatteryUnrestricted,
  requestDisableBatteryOptimization,
  lockNow,
  isAggressiveOem,
  openAutostartSettings,
};

// Throttle: a flood of "sync" pushes must not spam the native lock/sync.
// The throttle COALESCES — it never drops a sync. When called inside the
// window, it schedules a trailing run so a state change (e.g. a lock) can't be
// silently lost. State-changing callers (lock/command realtime, push wake,
// app resume) pass force=true to bypass entirely.
let lastSyncAt = 0;
let pendingSync = false;
let syncTimer: ReturnType<typeof setTimeout> | null = null;

/** Fetch blocked apps + focus windows + lock state, push them to the native
 *  accessibility service (which enforces them). */
export async function syncBlockRules(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastSyncAt < 2500) {
    if (!pendingSync) {
      pendingSync = true;
      syncTimer = setTimeout(() => {
        pendingSync = false;
        syncTimer = null;
        syncBlockRules(true).catch(() => {});
      }, 2500 - (now - lastSyncAt));
    }
    return;
  }
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
    pendingSync = false;
  }
  lastSyncAt = now;
  const childId = await getStoredChildId();
  if (!childId) return;
  try {
    const [limitsRes, focusRes, childRes, pauseRes] = await Promise.all([
      supabase.from("app_limits").select("package,blocked").eq("child_id", childId),
      supabase.rpc("my_focus"),
      supabase.from("children").select("locked,at_school").eq("id", childId).maybeSingle(),
      supabase.rpc("my_pause", { p_child: childId }),
    ]);

    const isLocked = !!(childRes.data as any)?.locked;

    // An active, parent-granted pause suspends enforcement — UNLESS the parent
    // has locked the device. A lock always wins over a pause (a parent locking
    // the phone expects it locked even if a pause was previously granted).
    const pausedUntil = pauseRes.data ? new Date(pauseRes.data as string).getTime() : 0;
    if (!isLocked && pausedUntil > Date.now()) {
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
    // Auto school mode: while inside a school zone, Études is on all day.
    const atSchool = !!(childRes.data as any)?.at_school;
    setBlockRules({
      packages,
      studyEnabled: atSchool || !!f.study_enabled,
      studyStart: atSchool ? "00:00" : f.study_start ?? null,
      studyEnd: atSchool ? "23:59" : f.study_end ?? null,
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
