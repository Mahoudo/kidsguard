import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

const KEY = "kidsguard.emergencyPhone";

/** Fetch the family emergency phone and cache it locally (for offline SOS). */
export async function cacheEmergencyPhone(): Promise<void> {
  try {
    const { data, error } = await supabase.rpc("my_emergency_phone");
    if (error || !data) return;
    await AsyncStorage.setItem(KEY, String(data));
  } catch {}
}

export async function getEmergencyPhone(): Promise<string | null> {
  return AsyncStorage.getItem(KEY);
}
