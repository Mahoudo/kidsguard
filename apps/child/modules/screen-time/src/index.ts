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
      r.locked
    );
  } catch {}
}
