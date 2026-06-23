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

/**
 * Child side of the baby monitor. Listens for a parent's request and — ONLY
 * after the child accepts — captures the camera/mic and streams it. Nothing is
 * captured before [accept]; the UI shows a live banner the instant the camera
 * turns on (driven by [streaming], set before the offer round-trip).
 */
export function useChildStream(childId: string | null) {
  const [pendingRequest, setPendingRequest] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const sigRef = useRef<Signaling | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  // Streams held in refs so teardown never reads a stale value from a render
  // closure — otherwise stop() could fail to stop the tracks (camera stays on).
  const localRef = useRef<MediaStream | null>(null);
  const remoteRef = useRef<MediaStream | null>(null);
  // Remote ICE that arrives before setRemoteDescription is buffered, then flushed.
  const remoteSet = useRef(false);
  const iceQueue = useRef<any[]>([]);
  // Dedup guard: true once a request is pending or a session is live, so a
  // duplicate/stale "request" can't pop a second consent dialog.
  const pendingRef = useRef(false);
  // Latest-stop ref so the signaling effect always invokes the current stop().
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!childId) return;
    const sig = openSignaling(childId, "child", async (msg) => {
      switch (msg.event) {
        case "request": {
          // Drop a stale request (e.g. delivered when the app resumes long
          // after the parent gave up) and dedup concurrent ones.
          const ts = msg.payload?.ts;
          if (ts && Date.now() - ts > 30_000) break;
          if (pcRef.current || pendingRef.current) break;
          pendingRef.current = true;
          setPendingRequest(true);
          break;
        }
        case "answer":
          await pcRef.current?.setRemoteDescription(new RTCSessionDescription(msg.payload));
          remoteSet.current = true;
          await flushIce();
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
      iceQueue.current.push(payload); // not ready yet -> buffer
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

  async function accept() {
    setPendingRequest(false);
    pendingRef.current = false;
    const sig = sigRef.current;
    if (!sig) return;
    if (pcRef.current) stop(); // tear down any previous session first (no leak)
    sig.send("consent");
    try {
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: "user" },
      });
      // Camera is now physically on -> show the banner IMMEDIATELY, before the
      // (slower) offer + TURN round-trip, so capture is never silent.
      localRef.current = stream;
      setLocalStream(stream);
      setStreaming(true);

      const pc = new RTCPeerConnection(await iceConfig());
      pcRef.current = pc;
      remoteSet.current = false;
      iceQueue.current = [];

      // sendrecv transceivers so the parent's reverse audio/video has a section
      // in this offer -> true two-way without a second renegotiation.
      const aud = stream.getAudioTracks()[0];
      const vid = stream.getVideoTracks()[0];
      if (aud) pc.addTransceiver(aud, { direction: "sendrecv", streams: [stream] });
      if (vid) pc.addTransceiver(vid, { direction: "sendrecv", streams: [stream] });

      (pc as any).addEventListener("icecandidate", (e: any) => {
        if (e.candidate) sig.send("ice", e.candidate);
      });
      // Two-way: receive the parent's camera (reassuring "babysitter" view).
      // Rebuild the remote stream from ALL receivers each time — the parent
      // attaches via replaceTrack, so tracks arrive WITHOUT a stream
      // (e.streams is empty); collecting the receivers' tracks shows them.
      (pc as any).addEventListener("track", () => {
        const tracks = pc.getReceivers().map((r: any) => r.track).filter(Boolean);
        if (!tracks.length) return;
        const s = new MediaStream(tracks);
        remoteRef.current = s;
        setRemoteStream(s);
      });

      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);
      sig.send("offer", offer);
    } catch (e) {
      stop();
    }
  }

  function decline() {
    setPendingRequest(false);
    pendingRef.current = false;
    sigRef.current?.send("decline");
  }

  function stop() {
    setStreaming(false);
    setPendingRequest(false);
    pendingRef.current = false;
    stopTracks(localRef.current);
    stopTracks(remoteRef.current);
    localRef.current = null;
    remoteRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    remoteSet.current = false;
    iceQueue.current = [];
    try {
      pcRef.current?.close();
    } catch {}
    pcRef.current = null;
  }
  // Keep the ref pointing at the freshest stop (reads only refs/setters, so safe).
  stopRef.current = stop;

  return { pendingRequest, streaming, localStream, remoteStream, accept, decline, stop };
}

function stopTracks(stream: MediaStream | null) {
  try {
    stream?.getTracks().forEach((t) => t.stop());
  } catch {}
}
