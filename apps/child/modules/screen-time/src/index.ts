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
