import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

const KEY = "kidsguard.consent";

export async function hasConsent(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEY)) === "1";
}

export async function giveConsent(): Promise<void> {
  await AsyncStorage.setItem(KEY, "1");
}

/**
 * Record the child's consent SERVER-SIDE (audit H5) so sensitive collectors are
 * gated by a real consent record, not only the local flag. Best-effort: called
 * right after pairing; a no-op if the RPC isn't deployed yet.
 */
export async function recordServerConsent(childId: string): Promise<void> {
  try {
    await supabase.rpc("record_child_consent", { p_child: childId });
  } catch {
    // RPC not deployed yet / offline -> the local flag still applies.
  }
}
