import { Vibration } from "react-native";
import { supabase } from "./supabase";

let channel: ReturnType<typeof supabase.channel> | null = null;

/** Listen for parent commands (ring / stop_ring) addressed to this child. */
export function startCommandListener(childId: string) {
  if (channel) return;
  channel = supabase
    .channel(`commands-${childId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "commands",
        filter: `child_id=eq.${childId}`,
      },
      async (payload) => {
        const cmd = payload.new as { id: string; type: string };
        if (cmd.type === "ring") {
          // Loud-ish alert pattern. (Real audio-over-silent = expo-audio later.)
          Vibration.vibrate([0, 800, 400, 800, 400, 800], true);
          setTimeout(() => Vibration.cancel(), 15_000);
        } else if (cmd.type === "stop_ring") {
          Vibration.cancel();
        }
        await supabase
          .from("commands")
          .update({ status: "done" })
          .eq("id", cmd.id);
      }
    )
    .subscribe();
}

export function stopCommandListener() {
  if (channel) {
    supabase.removeChannel(channel);
    channel = null;
  }
}
