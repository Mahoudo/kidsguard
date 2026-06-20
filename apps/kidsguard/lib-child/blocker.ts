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
  openPrivateDnsSettings,
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
  openPrivateDnsSettings,
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
      // CRITICAL read: select ONLY columns that always exist. Adding an optional
      // column here (e.g. at_school) makes the whole select fail on a DB where
      // that migration hasn't run yet -> data null -> lock silently never applied
      // (this exact drift cost a week to debug). Keep locked isolated.
      supabase.from("children").select("locked").eq("id", childId).maybeSingle(),
      supabase.rpc("my_pause", { p_child: childId }),
    ]);

    const isLocked = !!(childRes.data as any)?.locked;

    // at_school (auto-school) is OPTIONAL — fetch it best-effort so a missing
    // column never breaks enforcement.
    let atSchool = false;
    try {
      const sch = await supabase
        .from("children")
        .select("at_school")
        .eq("id", childId)
        .maybeSingle();
      atSchool = !!(sch.data as any)?.at_school;
    } catch {}

    // Daily screen-time cap (base + today's bonus), best-effort. 0 = no cap.
    let dailyLimitMin = 0;
    try {
      const q = await supabase.rpc("my_screen_quota", { p_child: childId });
      dailyLimitMin = (q.data as number | null) ?? 0;
    } catch {}

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
        dailyLimitMin: 0, // a granted pause also suspends the daily cap
      });
      return;
    }

    const packages = (limitsRes.data ?? [])
      .filter((l: any) => l.blocked)
      .map((l: any) => l.package as string);
    const f: any = (focusRes.data as any[])?.[0] ?? {};
    // Auto school mode (atSchool computed best-effort above): Études on all day.
    setBlockRules({
      packages,
      studyEnabled: atSchool || !!f.study_enabled,
      studyStart: atSchool ? "00:00" : f.study_start ?? null,
      studyEnd: atSchool ? "23:59" : f.study_end ?? null,
      sleepEnabled: !!f.sleep_enabled,
      sleepStart: f.sleep_start ?? null,
      sleepEnd: f.sleep_end ?? null,
      locked: isLocked,
      dailyLimitMin,
    });
    // Real screen lock when the parent locked the device (needs device admin).
    if (isLocked) lockNow();
  } catch (e: any) {
    console.warn("syncBlockRules failed", e?.message);
  }
}
