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
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme, type Theme } from "../theme";
import {
  fetchGeofenceFeed,
  fetchSos,
  resolveSos,
  subscribeGeofence,
  subscribeSos,
} from "../../lib/api";

type Item =
  | { kind: "geo"; id: string; at: string; child: string; dir: "enter" | "exit"; place: string }
  | { kind: "sos"; id: string; sosId: string; at: string; child: string; resolved: boolean };

export default function AlertsScreen() {
  const t = useTheme();
  const s = makeStyles(t);
  const [items, setItems] = useState<Item[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [geo, sos] = await Promise.all([
        fetchGeofenceFeed(100).catch(() => []),
        fetchSos(50).catch(() => []),
      ]);
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
    return () => {
      clearInterval(poll);
      u1();
      u2();
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
    <SafeAreaView style={[s.container, { backgroundColor: t.bg }]} edges={["top"]}>
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
    </SafeAreaView>
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
