/**
 * WebRTC ICE config. Fetches short-lived TURN credentials from Metered at
 * runtime (relays media when the two devices are on different networks, where
 * STUN alone fails). Falls back to public STUN if the fetch fails.
 *
 * NOTE: the Metered API key is client-side by design, but this repo is PUBLIC —
 * the key is therefore exposed and its 0.5 GB free quota could be abused. For
 * production, proxy this fetch through a backend (e.g. a Supabase Edge Function)
 * and/or rotate the key. Acceptable for testing/MVP.
 */
const METERED_DOMAIN = "gospion.metered.live";
const METERED_API_KEY = "c96849c7c36aee2abf340a66945526a4521a";

const STUN_FALLBACK = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

let cached: any[] | null = null;

/** ICE servers (STUN + Metered TURN). Cached after the first successful fetch. */
export async function getIceServers(): Promise<any[]> {
  if (cached) return cached;
  try {
    const res = await fetch(
      `https://${METERED_DOMAIN}/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`
    );
    const servers = (await res.json()) as any[];
    if (Array.isArray(servers) && servers.length) {
      cached = servers;
      const turn = servers.filter((x) => String(x.urls).includes("turn")).length;
      console.log(`[KGrtc] ICE servers loaded: ${servers.length} (${turn} TURN)`);
      return servers;
    }
  } catch (e: any) {
    console.log(`[KGrtc] TURN fetch failed (${e?.message}) -> STUN only`);
  }
  return STUN_FALLBACK;
}

/** Build the RTCPeerConnection config with fresh ICE servers. */
export async function iceConfig(): Promise<{ iceServers: any[] }> {
  return { iceServers: await getIceServers() };
}
