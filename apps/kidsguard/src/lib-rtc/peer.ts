/**
 * Shared WebRTC peer config. Public STUN works on the same network / simple
 * NATs. For reliable cross-network connections add a TURN server here.
 */
export const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    // Free public TURN (Metered OpenRelay) — relays media when the two devices
    // are on DIFFERENT networks (mobile data / separate wifi), where STUN alone
    // fails. Fine for testing/MVP; for production create your own free Metered
    // account (https://dashboard.metered.ca) and use your own credentials.
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};
