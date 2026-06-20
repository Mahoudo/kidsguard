import { installedUserApps } from "../modules/screen-time";
import { supabase } from "./supabase";

/** Report the device's launchable apps so the parent sees + approves new ones. */
export async function reportInstalledApps(childId: string): Promise<void> {
  try {
    const apps = installedUserApps();
    if (!apps.length) return;
    await supabase.rpc("report_installed_apps", { p_child: childId, p_apps: apps });
  } catch {
    // best-effort; never block startup
  }
}
