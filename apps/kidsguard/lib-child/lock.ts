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

/** The "lost mode" note set by the parent (shown on the lock screen), or null. */
export async function getLostNote(): Promise<string | null> {
  const childId = await getStoredChildId();
  if (!childId) return null;
  const { data } = await supabase.rpc("my_lost_note", { p_child: childId });
  return (data as string | null) ?? null;
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
