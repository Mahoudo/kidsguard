import { useEffect, useRef, useState } from "react";
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  type MediaStream,
} from "react-native-webrtc";
import { iceConfig } from "./peer";
import { openSignaling, type Signaling } from "./signaling";

type Phase = "idle" | "requesting" | "declined" | "live";

/**
 * Parent side of the baby monitor. Sends a request the child must accept, then
 * receives the child's video after consent. No frame arrives before the child
 * grants consent + sends the offer.
 */
export function useParentMonitor(childId: string | null) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const sigRef = useRef<Signaling | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    if (!childId) return;
    const sig = openSignaling(childId, "parent", async (msg) => {
      switch (msg.event) {
        case "decline":
          setPhase("declined");
          break;
        case "offer":
          await handleOffer(msg.payload, sig);
          break;
        case "ice":
          if (msg.payload) await pcRef.current?.addIceCandidate(new RTCIceCandidate(msg.payload));
          break;
        case "end":
          stop();
          break;
      }
    });
    sigRef.current = sig;
    return () => {
      stop();
      sig.close();
      sigRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId]);

  async function handleOffer(offer: any, sig: Signaling) {
    const pc = new RTCPeerConnection(await iceConfig());
    pcRef.current = pc;
    (pc as any).addEventListener("icecandidate", (e: any) => {
      if (e.candidate) sig.send("ice", e.candidate);
    });
    (pc as any).addEventListener("track", (e: any) => {
      if (e.streams && e.streams[0]) {
        setRemoteStream(e.streams[0]);
        setPhase("live");
      }
    });
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    // Two-way: capture the parent's camera too so the child can see them.
    try {
      const mine = await mediaDevices.getUserMedia({ audio: true, video: { facingMode: "user" } });
      setLocalStream(mine);
      mine.getTracks().forEach((t) => pc.addTrack(t, mine));
    } catch {
      // No camera/permission on parent -> stays one-way (still receives child).
    }
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sig.send("answer", answer);
  }

  /** Ask the child to start streaming (child must accept). */
  function start() {
    setPhase("requesting");
    setRemoteStream(null);
    sigRef.current?.send("request");
  }

  function stop() {
    sigRef.current?.send("end");
    setPhase("idle");
    setRemoteStream(null);
    try {
      localStream?.getTracks().forEach((t) => t.stop());
    } catch {}
    setLocalStream(null);
    pcRef.current?.close();
    pcRef.current = null;
  }

  return { phase, remoteStream, localStream, start, stop };
}
