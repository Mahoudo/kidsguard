import { useEffect, useRef, useState } from "react";
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  type MediaStream,
} from "react-native-webrtc";
import { ICE_CONFIG } from "./peer";
import { openSignaling, type Signaling } from "./signaling";

/**
 * Child side of the baby monitor. Listens for a parent's request and — ONLY
 * after the child accepts — captures the camera/mic and streams it. Nothing is
 * captured before [accept]; the UI shows a live banner while [streaming].
 */
export function useChildStream(childId: string | null) {
  const [pendingRequest, setPendingRequest] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const sigRef = useRef<Signaling | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    if (!childId) return;
    const sig = openSignaling(childId, "child", async (msg) => {
      switch (msg.event) {
        case "request":
          setPendingRequest(true);
          break;
        case "answer":
          await pcRef.current?.setRemoteDescription(new RTCSessionDescription(msg.payload));
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

  async function accept() {
    setPendingRequest(false);
    const sig = sigRef.current;
    if (!sig) return;
    sig.send("consent");
    try {
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: "user" },
      });
      setLocalStream(stream);

      const pc = new RTCPeerConnection(ICE_CONFIG);
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      (pc as any).addEventListener("icecandidate", (e: any) => {
        if (e.candidate) sig.send("ice", e.candidate);
      });
      // Two-way: also receive the parent's camera (reassuring "babysitter" view).
      (pc as any).addEventListener("track", (e: any) => {
        if (e.streams && e.streams[0]) setRemoteStream(e.streams[0]);
      });

      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);
      sig.send("offer", offer);
      setStreaming(true);
    } catch (e) {
      stop();
    }
  }

  function decline() {
    setPendingRequest(false);
    sigRef.current?.send("decline");
  }

  function stop() {
    setStreaming(false);
    setPendingRequest(false);
    localStreamCleanup(localStream);
    setLocalStream(null);
    setRemoteStream(null);
    pcRef.current?.close();
    pcRef.current = null;
  }

  return { pendingRequest, streaming, localStream, remoteStream, accept, decline, stop };
}

function localStreamCleanup(stream: MediaStream | null) {
  try {
    stream?.getTracks().forEach((t) => t.stop());
  } catch {}
}
