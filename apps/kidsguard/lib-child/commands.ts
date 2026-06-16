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
type Cmd = { id: string; type: string; payload?: { room?: string } };

// Last onCall handler, so wake-driven replays (push) can honor "call" too.
let callHandler: ((room: string) => void) | undefined;
let lastChildId: string | null = null;

async function runCommand(cmd: Cmd) {
  // Claim atomically: flip pending->done and act ONLY if we won the row. This
  // makes delivery exactly-once when realtime INSERT and processPendingCommands
  // race for the same command (otherwise the siren would fire twice).
  const { data: claimed } = await supabase
    .from("commands")
    .update({ status: "done" })
    .eq("id", cmd.id)
    .eq("status", "pending")
    .select("id");
  if (!claimed || claimed.length === 0) return; // already handled elsewhere
  if (cmd.type === "ring") {
    await playSiren();
    if (stopTimer) clearTimeout(stopTimer);
    stopTimer = setTimeout(stopSiren, 30_000);
  } else if (cmd.type === "stop_ring") {
    stopSiren();
  } else if (cmd.type === "call") {
    const room = cmd.payload?.room;
    if (room) callHandler?.(room);
  }
}

/**
 * Execute any commands the parent queued while we weren't subscribed (app
 * killed/backgrounded by MIUI). Called on listener start and on push-wake —
 * this is what makes "ring" reliable when the app wasn't already live.
 */
export async function processPendingCommands(childId?: string): Promise<void> {
  const id = childId ?? lastChildId;
  if (!id) return;
  const { data } = await supabase
    .from("commands")
    .select("id,type,payload")
    .eq("child_id", id)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  for (const cmd of (data as Cmd[]) ?? []) {
    await runCommand(cmd);
  }
}

export function startCommandListener(
  childId: string,
  opts?: { onCall?: (room: string) => void }
) {
  lastChildId = childId;
  callHandler = opts?.onCall;
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
        await runCommand(payload.new as Cmd);
      }
    )
    .subscribe();
  // Replay anything that arrived while we were offline.
  processPendingCommands(childId).catch(() => {});
}

export function stopCommandListener() {
  stopSiren();
  if (channel) {
    supabase.removeChannel(channel);
    channel = null;
  }
  lastChildId = null; // avoid replaying the old child's commands after re-pair
  callHandler = undefined;
}
