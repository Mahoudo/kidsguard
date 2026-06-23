import { supabase } from "../../lib/supabase";

/** WebRTC signaling messages exchanged between the parent and child devices. */
export type RtcEvent =
  | "request" // parent -> child: please start streaming (child must accept)
  | "consent" // child -> parent: accepted
  | "decline" // child -> parent: refused
  | "offer" // child -> parent: SDP offer
  | "answer" // parent -> child: SDP answer
  | "ice" // both: ICE candidate
  | "end"; // either: hang up

export interface RtcMessage {
  event: RtcEvent;
  from: "parent" | "child";
  payload?: any;
}

export interface Signaling {
  send: (event: RtcEvent, payload?: any) => void;
  close: () => void;
}

/**
 * Open a signaling channel for a child, over Supabase Realtime broadcast (no DB
 * writes). The channel name embeds the child UUID and is a PRIVATE channel:
 * Realtime Authorization (migration 0036) gates it so only the paired parent
 * (owns_child) or child device (is_child_device) can join/send. The child UUID
 * is no longer the only secret (audit C3).
 */
export function openSignaling(
  childId: string,
  self: "parent" | "child",
  onMessage: (msg: RtcMessage) => void
): Signaling {
  const name = `rtc-${childId}`;
  console.log(`[KGrtc] ${self} opening ${name} (private)`);
  const channel = supabase.channel(name, {
    config: { broadcast: { self: false }, private: true },
  });

  channel.on("broadcast", { event: "signal" }, ({ payload }) => {
    const msg = payload as RtcMessage;
    console.log(`[KGrtc] ${self} recv ${msg?.event} from ${msg?.from}`);
    if (msg.from !== self) onMessage(msg); // ignore our own echoes
  });

  // Authorize the private channel with the current session JWT, then join.
  (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      await supabase.realtime.setAuth(data.session?.access_token ?? undefined);
    } catch (e: any) {
      console.log(`[KGrtc] ${self} setAuth failed: ${e?.message}`);
    }
    channel.subscribe((status) => {
      console.log(`[KGrtc] ${self} channel ${name} -> ${status}`);
    });
  })();

  return {
    send: (event, payload) => {
      console.log(`[KGrtc] ${self} send ${event}`);
      channel.send({ type: "broadcast", event: "signal", payload: { event, from: self, payload } });
    },
    close: () => {
      supabase.removeChannel(channel);
    },
  };
}
