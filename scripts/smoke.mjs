import { createClient } from "@supabase/supabase-js";

const url = "https://klpycbepbezfnmzuszgi.supabase.co";
const key = "sb_publishable_oHloa0R08RYmqyfRPnqBaw_6pavEbze";

const supabase = createClient(url, key);

console.log("1) anonymous sign-in...");
const { data: auth, error: authErr } = await supabase.auth.signInAnonymously();
if (authErr) {
  console.error("   FAIL:", authErr.message);
  process.exit(1);
}
console.log("   OK uid =", auth.user?.id);

console.log("2) RPC children_overview (expect [])...");
const { data: kids, error: rpcErr } = await supabase.rpc("children_overview");
if (rpcErr) {
  console.error("   FAIL:", rpcErr.message);
  process.exit(1);
}
console.log("   OK rows =", JSON.stringify(kids));

console.log("3) pair_device with bad code (expect error)...");
const { error: pairErr } = await supabase.rpc("pair_device", { p_code: "000000" });
console.log("   ", pairErr ? "OK rejected: " + pairErr.message : "UNEXPECTED success");

console.log("\nALL GOOD — cloud reachable, schema live, anon auth on.");
