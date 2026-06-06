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
import { useTheme, type Theme } from "../theme";
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
  const th = useTheme();
  const st = makeStyles(th);
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

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  const fmt = (iso: string) => new Date(iso).toLocaleString("fr-FR");
  const dur = (ms: number) => {
    const m = Math.round(ms / 60000);
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}min` : `${m}min`;
  };
  const totalScreen = usage.reduce((a, b) => a + b.total_ms, 0);

  const Stat = ({ label, value }: { label: string; value: string }) => (
    <View style={st.stat}>
      <Text style={st.statVal}>{value}</Text>
      <Text style={st.statLabel}>{label}</Text>
    </View>
  );

  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <View style={st.section}>
      <Text style={st.sectionTitle}>{title}</Text>
      {children}
    </View>
  );

  return (
    <SafeAreaView style={st.overlay} edges={["top", "bottom"]}>
      <View style={st.head}>
        <TouchableOpacity onPress={onClose} style={st.back}>
          <Text style={st.backTxt}>‹ Retour</Text>
        </TouchableOpacity>
        <Text style={st.title}>{childName}</Text>
        <View style={{ width: 64 }} />
      </View>

      {loading ? (
        <View style={st.center}>
          <ActivityIndicator size="large" color={th.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={st.statsRow}>
            <Stat label="Batterie" value={info?.last_battery_pct != null ? `${info.last_battery_pct}%` : "—"} />
            <Stat label="Écran" value={dur(totalScreen)} />
            <Stat label="Zones" value={String(geo.length)} />
            <Stat label="SOS" value={String(sos.length)} />
          </View>

          <Section title="Dernière position">
            {info?.lat != null ? (
              <Text style={st.line}>
                {info.lat.toFixed(5)}, {info.lng!.toFixed(5)}
                {"\n"}
                <Text style={st.muted}>{info.located_at ? fmt(info.located_at) : "—"}</Text>
              </Text>
            ) : (
              <Text style={st.muted}>Pas encore localisé.</Text>
            )}
          </Section>

          <Section title={`Temps d'écran aujourd'hui (${dur(totalScreen)})`}>
            {usage.length === 0 ? (
              <Text style={st.muted}>
                Aucune donnée. Active l'accès à l'usage sur le téléphone de l'enfant.
              </Text>
            ) : (
              usage.slice(0, 12).map((u) => (
                <View key={u.package} style={st.usageRow}>
                  <Text style={st.usageApp} numberOfLines={1}>
                    {u.app_name}
                  </Text>
                  <Text style={st.usageDur}>{dur(u.total_ms)}</Text>
                </View>
              ))
            )}
          </Section>

          <Section title={`Alertes SOS (${sos.length})`}>
            {sos.length === 0 ? (
              <Text style={st.muted}>Aucune.</Text>
            ) : (
              sos.map((s) => (
                <Text key={s.id} style={st.line}>
                  🆘 {fmt(s.created_at)}
                  {s.resolved_at ? " · résolu" : ""}
                </Text>
              ))
            )}
          </Section>

          <Section title={`Entrées/sorties de zone (${geo.length})`}>
            {geo.length === 0 ? (
              <Text style={st.muted}>Aucune.</Text>
            ) : (
              geo.slice(0, 20).map((e) => (
                <Text key={e.id} style={st.line}>
                  {e.direction === "enter" ? "🟢" : "🔴"} {e.place_name} ·{" "}
                  <Text style={st.muted}>{fmt(e.occurred_at)}</Text>
                </Text>
              ))
            )}
          </Section>

          <Section title={`Historique de position (${track.length})`}>
            {track.length === 0 ? (
              <Text style={st.muted}>Aucun point.</Text>
            ) : (
              track.slice(0, 30).map((p, i) => (
                <Text key={i} style={st.lineSmall}>
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

function makeStyles(t: Theme) {
  return StyleSheet.create({
    overlay: { position: "absolute", inset: 0, backgroundColor: t.bg },
    head: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border,
    },
    title: { fontSize: 18, fontWeight: "800", color: t.text },
    back: { width: 64, paddingVertical: 6, justifyContent: "center" },
    backTxt: { fontSize: 16, color: t.primary, fontWeight: "700" },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    statsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
    stat: {
      flex: 1,
      backgroundColor: t.cardAlt,
      borderRadius: 14,
      paddingVertical: 12,
      alignItems: "center",
    },
    statVal: { fontSize: 17, fontWeight: "800", color: t.primary },
    statLabel: { fontSize: 11, color: t.muted, marginTop: 2 },
    section: { marginBottom: 18 },
    sectionTitle: { fontSize: 15, fontWeight: "700", color: t.text, marginBottom: 8 },
    line: { fontSize: 14, color: t.text, lineHeight: 22 },
    lineSmall: { fontSize: 12, color: t.muted, lineHeight: 20 },
    muted: { color: t.muted, fontSize: 12 },
    usageRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 7,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border,
    },
    usageApp: { fontSize: 14, color: t.text, flex: 1, marginRight: 10 },
    usageDur: { fontSize: 13, fontWeight: "700", color: t.primary },
  });
}
