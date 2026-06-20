import ScreenTime from "./ScreenTimeModule";

export interface AppUsage {
  packageName: string;
  appName: string;
  totalMs: number;
}

/** Whether the screen-time native module is available in this build. */
export function isScreenTimeAvailable(): boolean {
  return !!ScreenTime;
}

/**
 * Android: PACKAGE_USAGE_STATS granted via Settings (special access).
 * iOS: FamilyControls authorization (requires Apple entitlement) — stubbed.
 * Returns false if the native module isn't present (never throws).
 */
export function hasUsagePermission(): boolean {
  try {
    return ScreenTime?.hasUsagePermission?.() ?? false;
  } catch {
    return false;
  }
}

/** Open the OS screen where the user grants usage-access. No-op if unavailable. */
export function openUsageAccessSettings(): void {
  try {
    ScreenTime?.openUsageAccessSettings?.();
  } catch {}
}

/** Per-app foreground time since midnight (Android). [] if unavailable. */
export async function getUsageToday(): Promise<AppUsage[]> {
  try {
    if (!ScreenTime?.getUsageToday) return [];
    return await ScreenTime.getUsageToday();
  } catch {
    return [];
  }
}

export interface BlockRules {
  packages: string[];
  studyEnabled: boolean;
  studyStart: string | null;
  studyEnd: string | null;
  sleepEnabled: boolean;
  sleepStart: string | null;
  sleepEnd: string | null;
  locked: boolean;
  dailyLimitMin: number; // 0 = no daily screen-time cap
}

/** Total foreground minutes used today (native UsageStats). 0 if unavailable. */
export function usageTodayMin(): number {
  try {
    return ScreenTime?.usageTodayMin?.() ?? 0;
  } catch {
    return 0;
  }
}

/** Is the app-blocker accessibility service enabled? */
export function isAccessibilityEnabled(): boolean {
  try {
    return ScreenTime?.isAccessibilityEnabled?.() ?? false;
  } catch {
    return false;
  }
}

/** Open the OS accessibility settings to enable the blocker. */
export function openAccessibilitySettings(): void {
  try {
    ScreenTime?.openAccessibilitySettings?.();
  } catch {}
}

/** Is KidsGuard an active device admin? (anti-uninstall). false if unavailable. */
export function isAdminActive(): boolean {
  try {
    return ScreenTime?.isAdminActive?.() ?? false;
  } catch {
    return false;
  }
}

/** Prompt the user to grant device-admin (anti-uninstall protection). No-op if unavailable. */
export function requestAdmin(): void {
  try {
    ScreenTime?.requestAdmin?.();
  } catch {}
}

/** Is the app exempt from battery optimization (can run in background)? */
export function isBatteryUnrestricted(): boolean {
  try {
    return ScreenTime?.isBatteryUnrestricted?.() ?? false;
  } catch {
    return false;
  }
}

/** Prompt the user to exempt the app from battery optimization. No-op if unavailable. */
export function requestDisableBatteryOptimization(): void {
  try {
    ScreenTime?.requestDisableBatteryOptimization?.();
  } catch {}
}

/** Lock the device screen now (real lock, needs PIN). No-op if admin inactive. */
export function lockNow(): void {
  try {
    ScreenTime?.lockNow?.();
  } catch {}
}

/** True on OEMs (Xiaomi/Transsion/Oppo/Vivo/Huawei…) that gate "Autostart"
 *  behind their security app and aggressively kill background apps. */
export function isAggressiveOem(): boolean {
  try {
    return ScreenTime?.isAggressiveOem?.() ?? false;
  } catch {
    return false;
  }
}

/** Deep-link to the OEM "Autostart" / "Auto-launch" manager. No-op if unavailable. */
export function openAutostartSettings(): void {
  try {
    ScreenTime?.openAutostartSettings?.();
  } catch {}
}

/** Force media + alarm volume to max so the find-my-phone siren is audible. */
export function boostAudioForSiren(): void {
  try {
    ScreenTime?.boostAudioForSiren?.();
  } catch {}
}

/** Open Android Private DNS settings (point at a filtering resolver). */
export function openPrivateDnsSettings(): void {
  try {
    ScreenTime?.openPrivateDnsSettings?.();
  } catch {}
}

/** Launchable apps installed on the device (for install approval). [] if N/A. */
export function installedUserApps(): { package: string; name: string }[] {
  try {
    return ScreenTime?.installedUserApps?.() ?? [];
  } catch {
    return [];
  }
}

/** SIM identity "MCC+MNC|operatorName", or null if no SIM / unavailable. */
export function getSimInfo(): string | null {
  try {
    return ScreenTime?.getSimInfo?.() ?? null;
  } catch {
    return null;
  }
}

/** On-device EXIF scan: { total, geotagged } photo counts (metadata only). */
export async function scanPhotoPrivacy(): Promise<{ total: number; geotagged: number }> {
  try {
    if (!ScreenTime?.scanPhotoPrivacy) return { total: 0, geotagged: 0 };
    return await ScreenTime.scanPhotoPrivacy();
  } catch {
    return { total: 0, geotagged: 0 };
  }
}

/** Push the current block rules to the native service (SharedPreferences). */
export function setBlockRules(r: BlockRules): void {
  try {
    ScreenTime?.setBlockRules?.(
      r.packages,
      r.studyEnabled,
      r.studyStart,
      r.studyEnd,
      r.sleepEnabled,
      r.sleepStart,
      r.sleepEnd,
      r.locked,
      r.dailyLimitMin
    );
  } catch {}
}
