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
import {
  fetchGeofenceFeed,
  fetchSos,
  resolveSos,
  subscribeGeofence,
  subscribeSos,
} from "../../lib/api";

type Item =
  | {
      kind: "geo";
      id: string;
      at: string;
      child: string;
      dir: "enter" | "exit";
      place: string;
    }
  | {
      kind: "sos";
      id: string;
      sosId: string;
      at: string;
      child: string;
      resolved: boolean;
    };

export default function AlertsScreen() {
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
        ...sos.map((s) => ({
          kind: "sos" as const,
          id: "s" + s.id,
          sosId: s.id,
          at: s.created_at,
          child: s.child_name,
          resolved: !!s.resolved_at,
        })),
      ].sort((a, b) => b.at.localeCompare(a.at));
      setItems(merged);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const u1 = subscribeGeofence(load);
    const u2 = subscribeSos(load);
    return () => {
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
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.h1}>Notifications</Text>
        <TouchableOpacity onPress={load} style={styles.refreshBtn}>
          <Text style={styles.refreshTxt}>{refreshing ? "…" : "↻ Actualiser"}</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        ListEmptyComponent={
          <Text style={styles.muted}>
            Aucune notification. Crée des zones et teste un SOS depuis l'enfant.
          </Text>
        }
        renderItem={({ item }) => {
          if (item.kind === "sos") {
            return (
              <View style={styles.row}>
                <Text style={styles.dot}>🆘</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>
                    {item.child} a déclenché un SOS
                  </Text>
                  <Text style={styles.muted}>
                    {new Date(item.at).toLocaleString("fr-FR")}
                    {item.resolved ? " · résolu" : ""}
                  </Text>
                </View>
                {!item.resolved && (
                  <TouchableOpacity
                    onPress={() => onResolve(item.sosId)}
                    style={styles.resolveBtn}
                  >
                    <Text style={styles.resolveTxt}>Résoudre</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }
          const enter = item.dir === "enter";
          return (
            <View style={styles.row}>
              <Text style={styles.dot}>{enter ? "🟢" : "🔴"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>
                  {item.child} {enter ? "arrivé(e) à" : "parti(e) de"}{" "}
                  {item.place}
                </Text>
                <Text style={styles.muted}>
                  {new Date(item.at).toLocaleString("fr-FR")}
                </Text>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  h1: { fontSize: 24, fontWeight: "800", color: "#1f2440" },
  refreshBtn: {
    backgroundColor: "#f3f0ff",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  refreshTxt: { color: "#6B4EE6", fontWeight: "700", fontSize: 13 },
  muted: { color: "#6b7280", fontSize: 13, marginTop: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  dot: { fontSize: 16 },
  title: { fontSize: 15, fontWeight: "600", color: "#1f2440" },
  resolveBtn: {
    backgroundColor: "#ef4444",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  resolveTxt: { color: "#fff", fontWeight: "700", fontSize: 12 },
});
