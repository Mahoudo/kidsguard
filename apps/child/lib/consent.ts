import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "kidsguard.consent";

export async function hasConsent(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEY)) === "1";
}

export async function giveConsent(): Promise<void> {
  await AsyncStorage.setItem(KEY, "1");
}
