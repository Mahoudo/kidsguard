import { useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  fetchGeofenceFeed,
  subscribeGeofence,
  type GeofenceEvent,
} from "../../lib/api";

export default function AlertsScreen() {
  const [events, setEvents] = useState<GeofenceEvent[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    try {
      setEvents(await fetchGeofenceFeed(100));
    } catch (e: any) {
      console.warn(e.message);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    return subscribeGeofence(load);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.h1}>Alertes de zone</Text>
      <FlatList
        data={events}
        keyExtractor={(e) => String(e.id)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={load} />
        }
        ListEmptyComponent={
          <Text style={styles.muted}>
            Aucune alerte. Crée des zones (école, maison) depuis la carte.
          </Text>
        }
        renderItem={({ item }) => {
          const enter = item.direction === "enter";
          return (
            <View style={styles.row}>
              <Text style={styles.dot}>{enter ? "🟢" : "🔴"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>
                  {item.child_name} {enter ? "arrivé(e) à" : "parti(e) de"}{" "}
                  {item.place_name}
                </Text>
                <Text style={styles.muted}>
                  {new Date(item.occurred_at).toLocaleString("fr-FR")}
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
  h1: { fontSize: 24, fontWeight: "800", color: "#1f2440", marginBottom: 12 },
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
});
