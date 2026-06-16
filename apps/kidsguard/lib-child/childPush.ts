import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { getStoredChildId } from "./pairing";
import { supabase } from "./supabase";
import { syncBlockRules } from "./blocker";
import { processPendingCommands } from "./commands";

const PUSH_TASK = "kidsguard-push-sync";

// Background handler: a silent "sync" push wakes the app (even when closed) and
// reapplies the block/lock rules immediately + runs any queued parent commands
// (e.g. "ring") that we missed while offline. syncBlockRules also calls the
// real screen lock when the device is locked.
TaskManager.defineTask(PUSH_TASK, async () => {
  try {
    const childId = await getStoredChildId();
    await syncBlockRules(true);
    await processPendingCommands(childId ?? undefined);
  } catch {}
});

/** Register the child device for push and store its token so the server can wake it. */
export async function registerChildPush(): Promise<void> {
  try {
    const childId = await getStoredChildId();
    if (!childId || !Device.isDevice) return;

    let status = (await Notifications.getPermissionsAsync()).status;
    if (status !== "granted") {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return;

    const projectId =
      (Constants.expoConfig as any)?.extra?.eas?.projectId ??
      (Constants as any).easConfig?.projectId;
    if (!projectId) return;

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await supabase.rpc("set_child_push_token", { p_child: childId, p_token: token });

    try {
      await Notifications.registerTaskAsync(PUSH_TASK);
    } catch {}
  } catch (e: any) {
    console.warn("registerChildPush failed", e?.message);
  }
}

/** Foreground: also reapply rules immediately when a sync push arrives. */
export function listenChildPush(): () => void {
  const sub = Notifications.addNotificationReceivedListener((n) => {
    if ((n.request.content.data as any)?.type === "sync") {
      syncBlockRules(true).catch(() => {});
      processPendingCommands().catch(() => {});
    }
  });
  return () => sub.remove();
}
