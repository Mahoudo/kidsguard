import { useEffect, useRef, useState } from "react";
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  MediaStream,
} from "react-native-webrtc";
import { iceConfig } from "./peer";
import { openSignaling, type Signaling } from "./signaling";

type Phase = "idle" | "requesting" | "declined" | "live";

/**
 * Parent side of the baby monitor. Sends a request the child must accept, then
 * receives the child's video after consent. No frame arrives before the child
 * grants consent + sends the offer. Two-way: also sends the parent's camera.
 */
export function useParentMonitor(childId: string | null) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const sigRef = useRef<Signaling | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const remoteRef = useRef<MediaStream | null>(null);
  const remoteSet = useRef(false);
  const iceQueue = useRef<any[]>([]);
  const stopRef = useRef<() => void>(() => {});

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
          await addOrQueueIce(msg.payload);
          break;
        case "end":
          stopRef.current();
          break;
      }
    });
    sigRef.current = sig;
    return () => {
      stopRef.current();
      sig.close();
      sigRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId]);

  async function addOrQueueIce(payload: any) {
    if (!payload) return;
    if (remoteSet.current && pcRef.current) {
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(payload));
      } catch {}
    } else {
      iceQueue.current.push(payload); // PC/remote-desc not ready -> buffer
    }
  }

  async function flushIce() {
    const pc = pcRef.current;
    if (!pc) return;
    const q = iceQueue.current;
    iceQueue.current = [];
    for (const c of q) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch {}
    }
  }

  async function handleOffer(offer: any, sig: Signaling) {
    if (pcRef.current) stop(); // tear down a previous session first (no leak)
    const pc = new RTCPeerConnection(await iceConfig());
    pcRef.current = pc;
    remoteSet.current = false;
    iceQueue.current = [];

    (pc as any).addEventListener("icecandidate", (e: any) => {
      if (e.candidate) sig.send("ice", e.candidate);
    });
    (pc as any).addEventListener("track", () => {
      const tracks = pc.getReceivers().map((r: any) => r.track).filter(Boolean);
      if (!tracks.length) return;
      const s = new MediaStream(tracks);
      remoteRef.current = s;
      setRemoteStream(s);
      setPhase("live");
    });

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    remoteSet.current = true;
    await flushIce();

    // Two-way: attach the parent's camera/mic to the child's reciprocal media
    // sections (replaceTrack on the existing transceivers -> NO renegotiation).
    try {
      const mine = await mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: "user" },
      });
      localRef.current = mine;
      setLocalStream(mine);
      const myA = mine.getAudioTracks()[0];
      const myV = mine.getVideoTracks()[0];
      let usedA = false;
      let usedV = false;
      pc.getTransceivers().forEach((tr: any) => {
        const kind = tr.receiver?.track?.kind;
        if (kind === "audio" && myA && !usedA) {
          tr.sender.replaceTrack(myA);
          try { tr.direction = "sendrecv"; } catch {}
          usedA = true;
        } else if (kind === "video" && myV && !usedV) {
          tr.sender.replaceTrack(myV);
          try { tr.direction = "sendrecv"; } catch {}
          usedV = true;
        }
      });
      // Fallback if a section wasn't found (older RN-WebRTC): plain addTrack.
      if (myA && !usedA) pc.addTrack(myA, mine);
      if (myV && !usedV) pc.addTrack(myV, mine);
    } catch {
      // No camera/permission on parent -> stays one-way (still receives child).
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sig.send("answer", answer);
  }

  /** Ask the child to start streaming (child must accept). */
  function start() {
    if (pcRef.current) stop(); // reset any live/stale session before re-requesting
    setPhase("requesting");
    setRemoteStream(null);
    sigRef.current?.send("request", { ts: Date.now() }); // ts lets the child drop stale requests
  }

  function stop() {
    sigRef.current?.send("end");
    setPhase("idle");
    stopTracks(localRef.current);
    stopTracks(remoteRef.current);
    localRef.current = null;
    remoteRef.current = null;
    setRemoteStream(null);
    setLocalStream(null);
    remoteSet.current = false;
    iceQueue.current = [];
    try {
      pcRef.current?.close();
    } catch {}
    pcRef.current = null;
  }
  stopRef.current = stop;

  return { phase, remoteStream, localStream, start, stop };
}

function stopTracks(stream: MediaStream | null) {
  try {
    stream?.getTracks().forEach((t) => t.stop());
  } catch {}
}
