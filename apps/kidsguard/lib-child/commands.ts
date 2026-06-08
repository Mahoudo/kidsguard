import { Vibration } from "react-native";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { supabase } from "./supabase";

let channel: ReturnType<typeof supabase.channel> | null = null;
let player: AudioPlayer | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;

async function playSiren() {
  try {
    // Play even when the phone is on silent.
    await setAudioModeAsync({ playsInSilentMode: true });
    if (!player) {
      player = createAudioPlayer(require("../assets/siren.wav"));
      player.loop = true;
    }
    player.volume = 1.0;
    player.seekTo(0);
    player.play();
  } catch (e) {
    console.warn("siren play failed", e);
  }
  Vibration.vibrate([0, 800, 400, 800, 400, 800], true);
}

function stopSiren() {
  try {
    player?.pause();
  } catch {}
  Vibration.cancel();
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
}

/** Listen for parent commands (ring / stop_ring / call) addressed to this child. */
export function startCommandListener(
  childId: string,
  opts?: { onCall?: (room: string) => void }
) {
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
        const cmd = payload.new as {
          id: string;
          type: string;
          payload?: { room?: string };
        };
        if (cmd.type === "ring") {
          await playSiren();
          if (stopTimer) clearTimeout(stopTimer);
          stopTimer = setTimeout(stopSiren, 30_000);
        } else if (cmd.type === "stop_ring") {
          stopSiren();
        } else if (cmd.type === "call") {
          const room = cmd.payload?.room;
          if (room) opts?.onCall?.(room);
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
  stopSiren();
  if (channel) {
    supabase.removeChannel(channel);
    channel = null;
  }
}
