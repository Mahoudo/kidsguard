import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, type Theme } from "../theme";
import {
  fetchCheckins,
  fetchChildren,
  fetchGeofenceFeed,
  fetchSos,
  resolveSos,
  subscribeCheckins,
  subscribeGeofence,
  subscribeSos,
} from "../../lib/api";

type Item =
  | { kind: "geo"; id: string; at: string; child: string; dir: "enter" | "exit"; place: string }
  | { kind: "sos"; id: string; sosId: string; at: string; child: string; resolved: boolean }
  | { kind: "check"; id: string; at: string; child: string; mood: string | null; ckind: string }
  | { kind: "batt"; id: string; at: string; child: string; pct: number };

const MOOD: Record<string, string> = { happy: "😀", ok: "🙂", sad: "😟" };

// Battery at/below this (%) surfaces an actionable "low battery" card — a dying
// phone is the #1 parent stress, so we make it a real notification (not just the
// transient push on the home screen). Mood stays the child's own voice; this is
// a separate, system-driven signal.
const LOW_BATTERY = 20;
// Ignore stale readings: a 3-day-old "8%" is noise (the phone died or charged
// since). Only flag a low battery seen recently.
const BATT_FRESH_MS = 3 * 60 * 60 * 1000;

export default function AlertsScreen() {
  const t = useTheme();
  const s = makeStyles(t);
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Item[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [geo, sos, checks, kids] = await Promise.all([
        fetchGeofenceFeed(100).catch(() => []),
        fetchSos(50).catch(() => []),
        fetchCheckins(50).catch(() => []),
        fetchChildren().catch(() => []),
      ]);
      const now = Date.now();
      const battItems: Item[] = kids
        .filter((k) => {
          const b = k.last_battery_pct;
          const seen = k.last_seen_at ?? k.located_at;
          return (
            b != null &&
            b <= LOW_BATTERY &&
            !!seen &&
            now - new Date(seen).getTime() < BATT_FRESH_MS
          );
        })
        .map((k) => ({
          kind: "batt" as const,
          id: "b" + k.id,
          at: k.last_seen_at ?? k.located_at!,
          child: k.name,
          pct: k.last_battery_pct!,
        }));
      const merged: Item[] = [
        ...geo.map((g) => ({
          kind: "geo" as const,
          id: "g" + g.id,
          at: g.occurred_at,
          child: g.child_name,
          dir: g.direction,
          place: g.place_name,
        })),
        ...sos.map((x) => ({
          kind: "sos" as const,
          id: "s" + x.id,
          sosId: x.id,
          at: x.created_at,
          child: x.child_name,
          resolved: !!x.resolved_at,
        })),
        ...checks.map((k) => ({
          kind: "check" as const,
          id: "k" + k.id,
          at: k.created_at,
          child: k.child_name,
          mood: k.mood,
          ckind: k.kind,
        })),
        ...battItems,
      ].sort((a, b) => b.at.localeCompare(a.at));
      setItems(merged);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, 15_000);
    const u1 = subscribeGeofence(load);
    const u2 = subscribeSos(load);
    const u3 = subscribeCheckins(load);
    return () => {
      clearInterval(poll);
      u1();
      u2();
      u3();
    };
  }, [load]);

  async function onResolve(sosId: string) {
    try {
      await resolveSos(sosId);
      await load();
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? String(e));
    }
  }

  return (
    <View style={[s.container, { backgroundColor: t.bg, paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.h1}>Notifications</Text>
        <TouchableOpacity onPress={load} style={s.refreshBtn}>
          <Text style={s.refreshTxt}>{refreshing ? "…" : "↻ Actualiser"}</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16, paddingTop: 4 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={t.primary} />
        }
        ListEmptyComponent={
          <Text style={s.muted}>
            Aucune notification. Crée des zones et teste un SOS depuis l'enfant.
          </Text>
        }
        renderItem={({ item }) => {
          if (item.kind === "sos") {
            return (
              <View style={[s.card, { borderColor: t.danger }]}>
                <Text style={s.dot}>🆘</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>{item.child} a déclenché un SOS</Text>
                  <Text style={s.muted}>
                    {new Date(item.at).toLocaleString("fr-FR")}
                    {item.resolved ? " · résolu" : ""}
                  </Text>
                </View>
                {!item.resolved && (
                  <TouchableOpacity onPress={() => onResolve(item.sosId)} style={s.resolveBtn}>
                    <Text style={s.resolveTxt}>Résoudre</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }
          if (item.kind === "batt") {
            return (
              <View style={[s.card, { borderColor: t.warning }]}>
                <Text style={s.dot}>🪫</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>
                    {item.child} — batterie faible ({item.pct}%)
                  </Text>
                  <Text style={s.muted}>
                    Pense à lui faire charger le téléphone ·{" "}
                    {new Date(item.at).toLocaleString("fr-FR")}
                  </Text>
                </View>
              </View>
            );
          }
          if (item.kind === "check") {
            return (
              <View style={s.card}>
                <Text style={s.dot}>{item.mood ? MOOD[item.mood] ?? "💚" : "💚"}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>
                    {item.child}{" "}
                    {item.ckind === "arrived" ? "est bien arrivé(e)" : "va bien"}
                  </Text>
                  <Text style={s.muted}>{new Date(item.at).toLocaleString("fr-FR")}</Text>
                </View>
              </View>
            );
          }
          const enter = item.dir === "enter";
          return (
            <View style={s.card}>
              <Text style={s.dot}>{enter ? "🟢" : "🔴"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>
                  {item.child} {enter ? "arrivé(e) à" : "parti(e) de"} {item.place}
                </Text>
                <Text style={s.muted}>{new Date(item.at).toLocaleString("fr-FR")}</Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 8,
    },
    h1: { fontSize: 26, fontWeight: "900", color: t.text },
    refreshBtn: {
      backgroundColor: t.primarySoft,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
    },
    refreshTxt: { color: t.primary, fontWeight: "700", fontSize: 13 },
    muted: { color: t.muted, fontSize: 13, marginTop: 10, textAlign: "center" },
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: t.card,
      borderRadius: 16,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: t.border,
    },
    dot: { fontSize: 18 },
    title: { fontSize: 15, fontWeight: "700", color: t.text },
    resolveBtn: {
      backgroundColor: t.danger,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
    },
    resolveTxt: { color: "#fff", fontWeight: "800", fontSize: 12 },
  });
}
