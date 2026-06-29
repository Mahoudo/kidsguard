import { supabase } from "./supabase";
import { setSyncConfig, getDeviceSecret } from "../modules/screen-time";

/**
 * Wire up the reboot-proof remote enforcement path: the native accessibility
 * service polls Supabase directly for the lock/block state, so a parent
 * lock/unlock applies even after the child device reboots with the RN runtime
 * dead (MIUI freeze / blocked boot Activity).
 *
 * Idempotent — safe to call on every launch:
 *  - setSyncConfig hands the service the URL/anon key/child id and mints a
 *    256-bit per-device secret natively on first call (reused after).
 *  - set_device_secret registers that secret server-side (authed as the paired
 *    child device) so the otherwise-anonymous poll is accepted.
 */
export async function ensureDeviceSync(childId: string | null): Promise<void> {
  try {
    if (!childId) return;
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return;

    setSyncConfig(url, anonKey, childId);
    const secret = getDeviceSecret();
    if (!secret) return;

    await supabase.rpc("set_device_secret", { p_child: childId, p_secret: secret });
  } catch (e: any) {
    console.warn("ensureDeviceSync failed", e?.message);
  }
}
