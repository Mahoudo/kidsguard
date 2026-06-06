import AsyncStorage from "@react-native-async-storage/async-storage";
import { PairingCode } from "@kidsguard/shared";
import { supabase } from "./supabase";

const CHILD_ID_KEY = "kidsguard.childId";

export async function getStoredChildId(): Promise<string | null> {
  return AsyncStorage.getItem(CHILD_ID_KEY);
}

/** Redeem a 6-digit code: ensure anon session, bind this device to a child. */
export async function pairWithCode(code: string): Promise<string> {
  PairingCode.parse(code); // throws if not 6 digits

  // Ensure we have an anonymous session for this device.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
  }

  const { data, error } = await supabase.rpc("pair_device", { p_code: code });
  if (error) throw error;

  const childId = data as string;
  await AsyncStorage.setItem(CHILD_ID_KEY, childId);
  return childId;
}

export async function unpair(): Promise<void> {
  await AsyncStorage.removeItem(CHILD_ID_KEY);
  await supabase.auth.signOut();
}
