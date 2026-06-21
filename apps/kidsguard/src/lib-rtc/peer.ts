/**
 * Shared WebRTC peer config. Public STUN works on the same network / simple
 * NATs. For reliable cross-network connections add a TURN server here.
 */
export const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    // TODO: add a TURN server for cross-network reliability, e.g.
    // { urls: "turn:your.turn.server:3478", username: "user", credential: "pass" },
  ],
};
