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
  // Web: expo-notifications can't schedule; use the browser Notification API.
  if (Platform.OS === "web") {
    try {
      const N = (globalThis as any).Notification;
      if (N) {
        const show = () =>
          new N("🆘 SOS", {
            body: `${childName} a déclenché une alerte SOS !`,
            requireInteraction: true,
          });
        if (N.permission === "granted") show();
        else if (N.permission !== "denied")
          N.requestPermission().then((p: string) => p === "granted" && show());
      }
    } catch {}
    return;
  }
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

/** Lightweight local notification (e.g. low battery). Safe no-op on web. */
export async function presentLocalAlert(title: string, body: string): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: null,
    });
  } catch {}
}

/** Register this device for push and store the Expo token on the parent profile. */
export async function registerForPush(): Promise<void> {
  // Web: no Expo push token, but ask for browser notification permission so
  // presentSosAlert can show a real notification bubble while the tab is open.
  if (Platform.OS === "web") {
    try {
      const N = (globalThis as any).Notification;
      if (N && N.permission === "default") await N.requestPermission();
    } catch {}
    return;
  }
  if (!Device.isDevice) return; // no push on simulators

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
