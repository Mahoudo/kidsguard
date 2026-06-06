import ScreenTime from "./ScreenTimeModule";

export interface AppUsage {
  packageName: string;
  appName: string;
  totalMs: number;
}

/**
 * Android: PACKAGE_USAGE_STATS granted via Settings (special access).
 * iOS: FamilyControls authorization (requires Apple entitlement) — stubbed.
 */
export function hasUsagePermission(): boolean {
  return ScreenTime.hasUsagePermission();
}

/** Open the OS screen where the user grants usage-access. */
export function openUsageAccessSettings(): void {
  ScreenTime.openUsageAccessSettings();
}

/** Per-app foreground time since midnight (Android). [] on iOS for now. */
export async function getUsageToday(): Promise<AppUsage[]> {
  return ScreenTime.getUsageToday();
}
