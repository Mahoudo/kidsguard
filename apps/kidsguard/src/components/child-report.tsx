import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme, type Theme } from "../theme";
import {
  fetchCheckins,
  fetchChildTrack,
  fetchChildren,
  fetchGeofenceFeed,
  fetchPlaces,
  fetchSos,
  fetchUsage,
  fetchUsageRange,
  photoPrivacy,
  type PhotoPrivacy,
  type CheckinEvent,
  type ChildWithLocation,
  type GeofenceEvent,
  type PlaceOverview,
  type SosEvent,
  type TrackPoint,
  type UsageDay,
  type UsageRow,
} from "../../lib/api";
import { computeSecurityScore } from "../../lib/score";
import { generateSummary } from "../../lib/summary";
import { ChildControls } from "./child-controls";
import { MapPanel, type MapPanelHandle } from "./map-panel";

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
  const [zonesCount, setZonesCount] = useState(0);
  const [checkins, setCheckins] = useState<CheckinEvent[]>([]);
  const [usageWeek, setUsageWeek] = useState<UsageDay[]>([]);
  const [period, setPeriod] = useState<"day" | "week">("day");
  const [places, setPlaces] = useState<PlaceOverview[]>([]);
  const [sel, setSel] = useState<TrackPoint | null>(null);
  const [photo, setPhoto] = useState<PhotoPrivacy | null>(null);
  const mapRef = useRef<MapPanelHandle>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const today = new Date();
      const to = today.toISOString().slice(0, 10);
      const from = new Date(today.getTime() - 6 * 86400000)
        .toISOString()
        .slice(0, 10);
      try {
        const [kids, t, g, s, u, pl, ck, uw] = await Promise.all([
          fetchChildren().catch(() => []),
          fetchChildTrack(childId, 50).catch(() => []),
          fetchGeofenceFeed(200).catch(() => []),
          fetchSos(50).catch(() => []),
          fetchUsage(childId).catch(() => []),
          fetchPlaces().catch(() => []),
          fetchCheckins(100).catch(() => []),
          fetchUsageRange(childId, from, to).catch(() => []),
        ]);
        setInfo(kids.find((k) => k.id === childId) ?? null);
        setTrack(t);
        setPlaces(pl);
        setSel(t[0] ?? null); // default-select the latest point
        setGeo(g.filter((e) => e.child_id === childId));
        setSos(s.filter((e) => e.child_id === childId));
        setUsage(u);
        setZonesCount(pl.length);
        setCheckins(ck.filter((c) => c.child_id === childId));
        setUsageWeek(uw);
        setPhoto(await photoPrivacy(childId).catch(() => null));
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

  // Web: make the device/browser Back button close the report instead of
  // navigating away from the page.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    window.history.pushState({ kgReport: true }, "");
    let popped = false;
    const onPop = () => {
      popped = true;
      onClose();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (!popped) window.history.back(); // closed via button: drop our entry
    };
  }, [onClose]);

  const fmt = (iso: string) => new Date(iso).toLocaleString("fr-FR");
  const dur = (ms: number) => {
    const m = Math.round(ms / 60000);
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}min` : `${m}min`;
  };
  const totalScreen = usage.reduce((a, b) => a + b.total_ms, 0);
  const score = computeSecurityScore({
    name: childName,
    lastSeen: info?.last_seen_at ?? null,
    battery: info?.last_battery_pct ?? null,
    screenMs: totalScreen,
    zonesCount,
    unresolvedSos: sos.some((x) => !x.resolved_at),
  });
  const barColor = (v: number) =>
    v >= 80 ? "#1FC9A0" : v >= 60 ? "#FFA726" : "#FF4D6D";

  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const weekAgo = Date.now() - 7 * 86400000;
  const inPeriod = (iso: string) => {
    const ts = new Date(iso).getTime();
    return period === "day" ? ts >= startToday.getTime() : ts >= weekAgo;
  };
  const geoP = geo.filter((e) => inPeriod(e.occurred_at));
  const sosP = sos.filter((e) => inPeriod(e.created_at));
  const checkP = checkins.filter((c) => inPeriod(c.created_at));
  const screenP =
    period === "day" ? totalScreen : usageWeek.reduce((a, b) => a + b.total_ms, 0);
  const summary = generateSummary({
    name: childName,
    period,
    enters: geoP.filter((e) => e.direction === "enter").map((e) => ({ place: e.place_name })),
    exits: geoP.filter((e) => e.direction === "exit").map((e) => ({ place: e.place_name })),
    sos: sosP.map((x) => ({ resolved: !!x.resolved_at })),
    checkins: checkP.length,
    screenMs: screenP,
    topApp: usage[0]?.app_name ?? null,
    activeDays: period === "week" ? usageWeek.length : undefined,
  });

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

  // Click a history row -> select it and fly the map to that point.
  const selectPoint = (p: TrackPoint) => {
    setSel(p);
    mapRef.current?.centerOn([p.lng, p.lat], 16);
  };

  // Group the track by calendar day (newest first; track is already desc).
  const trackByDay: { day: string; points: TrackPoint[] }[] = [];
  {
    const byDay = new Map<string, TrackPoint[]>();
    for (const p of track) {
      const key = new Date(p.recorded_at).toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
      });
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(p);
    }
    for (const [day, points] of byDay) trackByDay.push({ day, points });
  }

  // The map shows a single marker at the selected point (default: latest).
  const mapPt =
    sel ??
    (info?.lat != null
      ? ({ recorded_at: info.located_at ?? "", lng: info.lng!, lat: info.lat } as TrackPoint)
      : null);
  const mapLocated: ChildWithLocation[] = mapPt
    ? [{ ...(info ?? {}), id: childId, name: childName, lng: mapPt.lng, lat: mapPt.lat } as ChildWithLocation]
    : [];
  const mapCenter: [number, number] = mapPt ? [mapPt.lng, mapPt.lat] : [-3.9039, 5.3747];

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
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
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <View style={[st.scoreCard, { borderColor: score.color }]}>
            <View style={st.scoreTop}>
              <View style={[st.scoreBadge, { backgroundColor: score.color }]}>
                <Text style={st.scoreVal}>{score.global}</Text>
                <Text style={st.scorePct}>%</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.scoreTitle}>Score de sécurité IA</Text>
                <Text style={st.scoreSummary}>{score.summary}</Text>
              </View>
            </View>
            {score.parts.map((p) => (
              <View key={p.key} style={st.barRow}>
                <Text style={st.barLabel}>{p.label}</Text>
                <View style={st.barTrack}>
                  <View
                    style={[
                      st.barFill,
                      { width: `${p.value}%`, backgroundColor: barColor(p.value) },
                    ]}
                  />
                </View>
                <Text style={st.barVal}>{p.value}</Text>
              </View>
            ))}
          </View>

          <View style={st.summaryCard}>
            <View style={st.sumHead}>
              <Text style={st.sumTitle}>{summary.title}</Text>
              <View style={st.toggle}>
                <TouchableOpacity
                  onPress={() => setPeriod("day")}
                  style={[st.toggleBtn, period === "day" && st.toggleOn]}
                >
                  <Text style={[st.toggleTxt, period === "day" && st.toggleTxtOn]}>Jour</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setPeriod("week")}
                  style={[st.toggleBtn, period === "week" && st.toggleOn]}
                >
                  <Text style={[st.toggleTxt, period === "week" && st.toggleTxtOn]}>Semaine</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={st.sumNarrative}>{summary.narrative}</Text>
            {summary.lines.map((l, idx) => (
              <Text key={idx} style={st.sumLine}>
                {l}
              </Text>
            ))}
          </View>

          <ChildControls childId={childId} usage={usage} />

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

          <Section title="Confidentialité des photos">
            {!photo || photo.total == null ? (
              <Text style={st.muted}>
                Pas encore analysé (analyse à la volée sur le téléphone, métadonnées
                uniquement — jamais le contenu).
              </Text>
            ) : (
              <Text style={st.line}>
                {photo.geotagged ?? 0} photo(s) géolocalisée(s) sur {photo.total}{" "}
                analysée(s).
                {"\n"}
                <Text style={st.muted}>
                  {(photo.geotagged ?? 0) > 0
                    ? "⚠️ Des photos révèlent un lieu. Pense à désactiver la géolocalisation de l'appareil photo."
                    : "✅ Aucune fuite de localisation détectée."}
                  {photo.scanned_at ? ` · ${fmt(photo.scanned_at)}` : ""}
                </Text>
              </Text>
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
              <>
                <View style={st.mapBox}>
                  <MapPanel
                    ref={mapRef}
                    located={mapLocated}
                    places={places}
                    center={mapCenter}
                  />
                </View>
                {sel && (
                  <Text style={st.mapHint}>
                    📍 {sel.lat.toFixed(5)}, {sel.lng.toFixed(5)} · {fmt(sel.recorded_at)}
                  </Text>
                )}
                {trackByDay.map((grp) => (
                  <View key={grp.day} style={{ marginTop: 10 }}>
                    <Text style={st.dayHeader}>{grp.day}</Text>
                    {grp.points.map((p, i) => {
                      const active =
                        sel?.recorded_at === p.recorded_at &&
                        sel?.lat === p.lat &&
                        sel?.lng === p.lng;
                      return (
                        <TouchableOpacity
                          key={i}
                          onPress={() => selectPoint(p)}
                          style={[st.histRow, active && st.histRowActive]}
                        >
                          <Text
                            style={[
                              st.lineSmall,
                              active && { color: th.primary, fontWeight: "700" },
                            ]}
                          >
                            {new Date(p.recorded_at).toLocaleTimeString("fr-FR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}{" "}
                            — {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </>
            )}
          </Section>
        </ScrollView>
      )}
    </SafeAreaView>
    </Modal>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: t.bg },
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
    scoreCard: {
      backgroundColor: t.card,
      borderRadius: 18,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1.5,
    },
    scoreTop: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 14 },
    scoreBadge: {
      width: 70,
      height: 70,
      borderRadius: 35,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
    },
    scoreVal: { color: "#fff", fontSize: 26, fontWeight: "900" },
    scorePct: { color: "#fff", fontSize: 13, fontWeight: "800", marginTop: 4 },
    scoreTitle: { fontSize: 15, fontWeight: "800", color: t.text, marginBottom: 4 },
    scoreSummary: { fontSize: 13, color: t.muted, lineHeight: 19 },
    barRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 7 },
    barLabel: { fontSize: 12, color: t.muted, width: 92 },
    barTrack: {
      flex: 1,
      height: 8,
      borderRadius: 4,
      backgroundColor: t.cardAlt,
      overflow: "hidden",
    },
    barFill: { height: 8, borderRadius: 4 },
    barVal: { fontSize: 12, fontWeight: "700", color: t.text, width: 26, textAlign: "right" },
    summaryCard: {
      backgroundColor: t.card,
      borderRadius: 18,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: t.border,
    },
    sumHead: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    sumTitle: { fontSize: 15, fontWeight: "800", color: t.text },
    toggle: { flexDirection: "row", backgroundColor: t.cardAlt, borderRadius: 999, padding: 3 },
    toggleBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
    toggleOn: { backgroundColor: t.primary },
    toggleTxt: { fontSize: 12, fontWeight: "700", color: t.muted },
    toggleTxtOn: { color: "#fff" },
    sumNarrative: { fontSize: 13.5, color: t.text, lineHeight: 20, marginBottom: 10 },
    sumLine: { fontSize: 13, color: t.muted, lineHeight: 22 },
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
    mapBox: {
      height: 320,
      borderRadius: 14,
      overflow: "hidden",
      marginBottom: 6,
      backgroundColor: t.cardAlt,
    },
    mapHint: { fontSize: 12, color: t.text, fontWeight: "600", marginBottom: 4 },
    dayHeader: {
      fontSize: 13,
      fontWeight: "800",
      color: t.text,
      textTransform: "capitalize",
      marginBottom: 2,
      marginTop: 4,
    },
    histRow: { paddingVertical: 5, paddingHorizontal: 8, borderRadius: 8 },
    histRowActive: { backgroundColor: t.cardAlt },
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
