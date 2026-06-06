import { getStoredChildId } from "./pairing";
import { supabase } from "./supabase";

/** Current lock state for this device (reads its own child row). */
export async function getLockState(): Promise<boolean> {
  const childId = await getStoredChildId();
  if (!childId) return false;
  const { data } = await supabase
    .from("children")
    .select("locked")
    .eq("id", childId)
    .maybeSingle();
  return !!(data as any)?.locked;
}

/** Live lock/unlock updates from the parent. */
export function subscribeLock(
  childId: string,
  onChange: (locked: boolean) => void
) {
  const ch = supabase
    .channel(`lock-${childId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "children",
        filter: `id=eq.${childId}`,
      },
      (payload) => onChange(!!(payload.new as any).locked)
    )
    .subscribe();
  return () => {
    supabase.removeChannel(ch);
  };
}
