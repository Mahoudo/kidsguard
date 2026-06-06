import { Platform, Vibration } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { supabase } from "./supabase";

// Show notifications while the app is foregrounded too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Strong local alert on the parent device when a child SOS arrives:
 *  vibrate hard + fire a high-priority local notification with sound. */
export async function presentSosAlert(childName: string): Promise<void> {
  try {
    Vibration.vibrate([0, 600, 300, 600, 300, 900]);
  } catch {}
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🆘 SOS",
        body: `${childName} a déclenché une alerte SOS !`,
        sound: true,
        vibrate: [0, 600, 300, 600],
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: null, // immediate
    });
  } catch {}
}

/** Register this device for push and store the Expo token on the parent profile. */
export async function registerForPush(): Promise<void> {
  if (!Device.isDevice) return; // no push on web / simulators

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== "granted") {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== "granted") return;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Alertes",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as any).easConfig?.projectId;
  if (!projectId) return;

  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      await supabase
        .from("profiles")
        .update({ expo_push_token: token })
        .eq("id", data.user.id);
    }
  } catch (e) {
    console.warn("registerForPush failed", e);
  }
}
