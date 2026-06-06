import * as Location from "expo-location";
import * as Battery from "expo-battery";
import { supabase } from "./supabase";

/** Raise an SOS alert with the device's current position. */
export async function raiseSos(childId: string): Promise<void> {
  let pos: Location.LocationObject;
  try {
    pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
  } catch {
    throw new Error("Position indisponible — active la localisation.");
  }

  const level = await Battery.getBatteryLevelAsync();
  const battery = level >= 0 ? Math.round(level * 100) : null;

  const { error } = await supabase.rpc("raise_sos", {
    p_child: childId,
    p_lng: pos.coords.longitude,
    p_lat: pos.coords.latitude,
    p_battery: battery,
  });
  if (error) throw error;
}
