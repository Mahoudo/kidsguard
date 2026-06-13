import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

const KEY = "kg_offline_queue";
const MAX = 300; // cap to avoid unbounded growth on long outages

type Queued = { fn: string; args: any; ts: number };

const isNetwork = (msg?: string) => {
  const m = (msg ?? "").toLowerCase();
  return m.includes("network") || m.includes("fetch") || m.includes("failed to") || m === "";
};

async function read(): Promise<Queued[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? "[]");
  } catch {
    return [];
  }
}
async function write(q: Queued[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(q.slice(-MAX)));
  } catch {}
}

async function enqueue(fn: string, args: any): Promise<void> {
  const q = await read();
  q.push({ fn, args, ts: Date.now() });
  await write(q);
}

/** Call an RPC; if the network is down, queue it for later instead of losing it. */
export async function rpcOrQueue(fn: string, args: any): Promise<void> {
  try {
    const { error } = await supabase.rpc(fn, args);
    if (error && isNetwork(error.message)) await enqueue(fn, args);
    // logic/auth errors are NOT queued (would loop forever)
  } catch {
    await enqueue(fn, args); // thrown = offline
  }
}

/** Replay queued calls oldest-first; stops at the first network failure. */
export async function flushQueue(): Promise<void> {
  const q = await read();
  if (q.length === 0) return;
  let i = 0;
  for (; i < q.length; i++) {
    try {
      const { error } = await supabase.rpc(q[i].fn, q[i].args);
      if (error && isNetwork(error.message)) break; // still offline
    } catch {
      break; // offline
    }
  }
  if (i > 0) await write(q.slice(i)); // drop the ones that went through
}
