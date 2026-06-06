import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  BackHandler,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  fetchChildTrack,
  fetchChildren,
  fetchGeofenceFeed,
  fetchSos,
  fetchUsage,
  type ChildWithLocation,
  type GeofenceEvent,
  type SosEvent,
  type TrackPoint,
  type UsageRow,
} from "../../lib/api";

interface Props {
  childId: string;
  childName: string;
  onClose: () => void;
}

export function ChildReport({ childId, childName, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<ChildWithLocation | null>(null);
  const [track, setTrack] = useState<TrackPoint[]>([]);
  const [geo, setGeo] = useState<GeofenceEvent[]>([]);
  const [sos, setSos] = useState<SosEvent[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [kids, t, g, s, u] = await Promise.all([
          fetchChildren().catch(() => []),
          fetchChildTrack(childId, 50).catch(() => []),
          fetchGeofenceFeed(100).catch(() => []),
          fetchSos(50).catch(() => []),
          fetchUsage(childId).catch(() => []),
        ]);
        setInfo(kids.find((k) => k.id === childId) ?? null);
        setTrack(t);
        setGeo(g.filter((e) => e.child_id === childId));
        setSos(s.filter((e) => e.child_id === childId));
        setUsage(u);
      } finally {
        setLoading(false);
      }
    })();
  }, [childId]);

  const fmt = (iso: string) => new Date(iso).toLocaleString("fr-FR");
  const dur = (ms: number) => {
    const m = Math.round(ms / 60000);
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}min` : `${m}min`;
  };
  const totalScreen = usage.reduce((a, b) => a + b.total_ms, 0);

  // Android hardware back closes the report (it's an overlay, not a route).
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  return (
    <SafeAreaView style={styles.overlay} edges={["top", "bottom"]}>
      <View style={styles.head}>
        <TouchableOpacity onPress={onClose} style={styles.back}>
          <Text style={styles.backTxt}>‹ Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{childName}</Text>
        <View style={{ width: 64 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#6B4EE6" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={styles.statsRow}>
            <Stat label="Batterie" value={info?.last_battery_pct != null ? `${info.last_battery_pct}%` : "—"} />
            <Stat label="Points" value={String(track.length)} />
            <Stat label="Zones" value={String(geo.length)} />
            <Stat label="SOS" value={String(sos.length)} />
          </View>

          <Section title="Dernière position">
            {info?.lat != null ? (
              <Text style={styles.line}>
                {info.lat.toFixed(5)}, {info.lng!.toFixed(5)}
                {"\n"}
                <Text style={styles.muted}>
                  {info.located_at ? fmt(info.located_at) : "—"}
                </Text>
              </Text>
            ) : (
              <Text style={styles.muted}>Pas encore localisé.</Text>
            )}
          </Section>

          <Section title={`Temps d'écran aujourd'hui (${dur(totalScreen)})`}>
            {usage.length === 0 ? (
              <Text style={styles.muted}>
                Aucune donnée. Active l'accès à l'usage sur le téléphone de l'enfant.
              </Text>
            ) : (
              usage.slice(0, 12).map((u) => (
                <View key={u.package} style={styles.usageRow}>
                  <Text style={styles.usageApp} numberOfLines={1}>
                    {u.app_name}
                  </Text>
                  <Text style={styles.usageDur}>{dur(u.total_ms)}</Text>
                </View>
              ))
            )}
          </Section>

          <Section title={`Alertes SOS (${sos.length})`}>
            {sos.length === 0 ? (
              <Text style={styles.muted}>Aucune.</Text>
            ) : (
              sos.map((s) => (
                <Text key={s.id} style={styles.line}>
                  🆘 {fmt(s.created_at)}
                  {s.resolved_at ? " · résolu" : ""}
                </Text>
              ))
            )}
          </Section>

          <Section title={`Entrées/sorties de zone (${geo.length})`}>
            {geo.length === 0 ? (
              <Text style={styles.muted}>Aucune.</Text>
            ) : (
              geo.slice(0, 20).map((e) => (
                <Text key={e.id} style={styles.line}>
                  {e.direction === "enter" ? "🟢" : "🔴"} {e.place_name} ·{" "}
                  <Text style={styles.muted}>{fmt(e.occurred_at)}</Text>
                </Text>
              ))
            )}
          </Section>

          <Section title={`Historique de position (${track.length})`}>
            {track.length === 0 ? (
              <Text style={styles.muted}>Aucun point.</Text>
            ) : (
              track.slice(0, 30).map((p, i) => (
                <Text key={i} style={styles.lineSmall}>
                  {fmt(p.recorded_at)} — {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                </Text>
              ))
            )}
          </Section>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    inset: 0,
    backgroundColor: "#fff",
  },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  title: { fontSize: 18, fontWeight: "800", color: "#1f2440" },
  back: {
    width: 64,
    paddingVertical: 6,
    justifyContent: "center",
  },
  backTxt: { fontSize: 16, color: "#6B4EE6", fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  stat: {
    flex: 1,
    backgroundColor: "#f6f5ff",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  statVal: { fontSize: 20, fontWeight: "800", color: "#6B4EE6" },
  statLabel: { fontSize: 11, color: "#6b7280", marginTop: 2 },
  section: { marginBottom: 18 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1f2440",
    marginBottom: 8,
  },
  line: { fontSize: 14, color: "#374151", lineHeight: 22 },
  lineSmall: { fontSize: 12, color: "#6b7280", lineHeight: 20 },
  muted: { color: "#9ca3af", fontSize: 12 },
  usageRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f0f0f4",
  },
  usageApp: { fontSize: 14, color: "#1f2440", flex: 1, marginRight: 10 },
  usageDur: { fontSize: 13, fontWeight: "700", color: "#6B4EE6" },
});
