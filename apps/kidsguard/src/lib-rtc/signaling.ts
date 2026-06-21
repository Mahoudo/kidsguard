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
 * Open an ephemeral signaling channel for a child, over Supabase Realtime
 * broadcast (no DB writes). The channel name embeds the child UUID so only the
 * paired devices use it.
 *
 * NOTE: broadcast is not RLS-gated — the child UUID is the shared secret. Harden
 * later with Realtime Authorization or a signaling table if needed.
 */
export function openSignaling(
  childId: string,
  self: "parent" | "child",
  onMessage: (msg: RtcMessage) => void
): Signaling {
  const channel = supabase.channel(`rtc-${childId}`, {
    config: { broadcast: { self: false } },
  });

  channel
    .on("broadcast", { event: "signal" }, ({ payload }) => {
      const msg = payload as RtcMessage;
      if (msg.from !== self) onMessage(msg); // ignore our own echoes
    })
    .subscribe();

  return {
    send: (event, payload) => {
      channel.send({ type: "broadcast", event: "signal", payload: { event, from: self, payload } });
    },
    close: () => {
      supabase.removeChannel(channel);
    },
  };
}
