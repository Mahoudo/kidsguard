import { useEffect, useState } from "react";
import {
  Alert,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTheme, type Theme } from "../theme";
import {
  getAutoSchool,
  getFocus,
  giveSupervisionConsent,
  listAppLimits,
  setAutoSchool,
  pendingPauses,
  respondPause,
  setAppLimit,
  setBirthYear,
  setFocus,
  setLost,
  supervisionStatus,
  type Focus,
  type PauseRequest,
  type SupervisionStatus,
  type UsageRow,
} from "../../lib/api";

const EMPTY: Focus = {
  study_enabled: false,
  study_start: null,
  study_end: null,
  sleep_enabled: false,
  sleep_start: null,
  sleep_end: null,
};

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

// Common apps to block — works even when on-device usage stats are empty
// (some Android skins, e.g. MIUI/HyperOS, return no UsageStats).
const PRESETS: { package: string; app_name: string }[] = [
  { package: "com.zhiliaoapp.musically", app_name: "TikTok" },
  { package: "com.ss.android.ugc.trill", app_name: "TikTok (Lite)" },
  { package: "com.google.android.youtube", app_name: "YouTube" },
  { package: "com.instagram.android", app_name: "Instagram" },
  { package: "com.snapchat.android", app_name: "Snapchat" },
  { package: "com.whatsapp", app_name: "WhatsApp" },
  { package: "com.facebook.katana", app_name: "Facebook" },
  { package: "com.facebook.orca", app_name: "Messenger" },
  { package: "com.twitter.android", app_name: "X (Twitter)" },
  { package: "org.telegram.messenger", app_name: "Telegram" },
  { package: "com.dts.freefireth", app_name: "Free Fire" },
  { package: "com.tencent.ig", app_name: "PUBG Mobile" },
  { package: "com.roblox.client", app_name: "Roblox" },
  { package: "com.netflix.mediaclient", app_name: "Netflix" },
  { package: "com.discord", app_name: "Discord" },
  { package: "com.android.chrome", app_name: "Chrome" },
];

export function ChildControls({
  childId,
  usage,
}: {
  childId: string;
  usage: UsageRow[];
}) {
  const t = useTheme();
  const s = makeStyles(t);
  const [focus, setFoc] = useState<Focus>(EMPTY);
  const [blocked, setBlocked] = useState<Record<string, boolean>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [lost, setLostState] = useState(false);
  const [pauses, setPauses] = useState<PauseRequest[]>([]);
  const [sup, setSup] = useState<SupervisionStatus | null>(null);
  const [year, setYear] = useState("");
  const [autoSchool, setAutoSch] = useState(false);

  useEffect(() => {
    (async () => {
      const f = await getFocus(childId).catch(() => null);
      if (f) setFoc(f);
      const al = await listAppLimits(childId).catch(() => []);
      const m: Record<string, boolean> = {};
      const nm: Record<string, string> = {};
      al.forEach((x) => {
        m[x.package] = x.blocked;
        nm[x.package] = x.app_name;
      });
      setBlocked(m);
      setNames(nm);
      setSup(await supervisionStatus(childId).catch(() => null));
      setAutoSch(await getAutoSchool(childId).catch(() => false));
    })();
  }, [childId]);

  async function toggleAutoSchool(on: boolean) {
    setAutoSch(on);
    try {
      await setAutoSchool(childId, on);
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? String(e));
    }
  }

  // Poll pending pause requests for this child.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const all = await pendingPauses().catch(() => []);
      if (alive) setPauses(all.filter((p) => p.child_id === childId));
    };
    load();
    const iv = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [childId]);

  async function toggleLost(on: boolean) {
    setLostState(on);
    try {
      await setLost(childId, on);
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? String(e));
    }
  }

  async function answerPause(id: string, grant: boolean) {
    try {
      await respondPause(id, grant);
      setPauses((p) => p.filter((x) => x.id !== id));
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? String(e));
    }
  }

  async function saveYear() {
    const y = parseInt(year, 10);
    if (!y || y < 1990 || y > 2025) {
      Alert.alert("Année invalide", "Entre une année de naissance valide.");
      return;
    }
    try {
      await setBirthYear(childId, y);
      setSup(await supervisionStatus(childId).catch(() => null));
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? String(e));
    }
  }

  async function consent() {
    try {
      await giveSupervisionConsent(childId);
      setSup(await supervisionStatus(childId).catch(() => null));
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? String(e));
    }
  }

  async function saveFocus(next: Focus) {
    setFoc(next);
    try {
      await setFocus(childId, next);
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? String(e));
    }
  }

  async function toggleBlock(pkg: string, name: string, val: boolean) {
    setBlocked((p) => ({ ...p, [pkg]: val }));
    try {
      await setAppLimit(childId, pkg, name, null, val);
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? String(e));
    }
  }

  const TimeBox = ({
    value,
    onChange,
  }: {
    value: string | null;
    onChange: (v: string) => void;
  }) => (
    <TextInput
      style={s.time}
      value={hhmm(value)}
      onChangeText={onChange}
      placeholder="09:00"
      placeholderTextColor={t.muted}
      maxLength={5}
    />
  );

  const FocusRow = ({
    icon,
    label,
    enabled,
    start,
    end,
    onToggle,
    onStart,
    onEnd,
  }: {
    icon: string;
    label: string;
    enabled: boolean;
    start: string | null;
    end: string | null;
    onToggle: (v: boolean) => void;
    onStart: (v: string) => void;
    onEnd: (v: string) => void;
  }) => (
    <View style={s.focusRow}>
      <Text style={s.focusLabel}>
        {icon} {label}
      </Text>
      <View style={s.focusRight}>
        {enabled && (
          <>
            <TimeBox value={start} onChange={onStart} />
            <Text style={s.dash}>–</Text>
            <TimeBox value={end} onChange={onEnd} />
          </>
        )}
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ true: t.primary }}
        />
      </View>
    </View>
  );

  // Merge: apps the child actually used + curated presets + anything already
  // configured — deduped by package. Lets the parent block apps even when the
  // device reports no usage data.
  const seen = new Set<string>();
  const apps: { package: string; app_name: string }[] = [];
  const add = (pkg: string, name: string) => {
    if (!pkg || seen.has(pkg)) return;
    seen.add(pkg);
    apps.push({ package: pkg, app_name: name || pkg });
  };
  usage.slice(0, 20).forEach((u) => add(u.package, u.app_name));
  PRESETS.forEach((p) => add(p.package, p.app_name));
  Object.keys(blocked).forEach((pkg) => add(pkg, names[pkg] ?? pkg));

  return (
    <View style={s.card}>
      <Text style={s.title}>Contrôle & Focus</Text>

      {pauses.length > 0 && (
        <View style={s.pauseBox}>
          {pauses.map((p) => (
            <View key={p.id} style={s.pauseRow}>
              <Text style={s.pauseTxt}>
                ⏸️ Demande de pause · {p.minutes} min
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Text style={s.pauseYes} onPress={() => answerPause(p.id, true)}>
                  Accepter
                </Text>
                <Text style={s.pauseNo} onPress={() => answerPause(p.id, false)}>
                  Refuser
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <FocusRow
        icon="📚"
        label="Mode Études"
        enabled={focus.study_enabled}
        start={focus.study_start}
        end={focus.study_end}
        onToggle={(v) => saveFocus({ ...focus, study_enabled: v })}
        onStart={(v) => saveFocus({ ...focus, study_start: v })}
        onEnd={(v) => saveFocus({ ...focus, study_end: v })}
      />
      <FocusRow
        icon="🌙"
        label="Mode Sommeil"
        enabled={focus.sleep_enabled}
        start={focus.sleep_start}
        end={focus.sleep_end}
        onToggle={(v) => saveFocus({ ...focus, sleep_enabled: v })}
        onStart={(v) => saveFocus({ ...focus, sleep_start: v })}
        onEnd={(v) => saveFocus({ ...focus, sleep_end: v })}
      />

      <View style={s.focusRow}>
        <Text style={s.focusLabel}>🏫 Mode école auto</Text>
        <Switch value={autoSchool} onValueChange={toggleAutoSchool} trackColor={{ true: t.primary }} />
      </View>
      <Text style={s.muted}>
        Active le blocage automatiquement quand l'enfant entre dans une zone « école ».
      </Text>

      <Text style={[s.subtitle, { marginTop: 12 }]}>Bloquer des applis</Text>
      {apps.length === 0 ? (
        <Text style={s.muted}>Aucune appli détectée encore.</Text>
      ) : (
        apps.map((a) => (
          <View key={a.package} style={s.appRow}>
            <Text style={s.appName} numberOfLines={1}>
              {a.app_name}
            </Text>
            <Switch
              value={!!blocked[a.package]}
              onValueChange={(v) => toggleBlock(a.package, a.app_name, v)}
              trackColor={{ true: t.danger }}
            />
          </View>
        ))
      )}
      <Text style={[s.muted, { marginTop: 8 }]}>
        Le blocage s'applique sur le téléphone de l'enfant (Android).
      </Text>

      <View style={s.sep} />
      <View style={s.focusRow}>
        <Text style={s.focusLabel}>📵 Mode perdu (anti-vol)</Text>
        <Switch
          value={lost}
          onValueChange={toggleLost}
          trackColor={{ true: t.danger }}
        />
      </View>
      <Text style={s.muted}>
        Verrouille le téléphone et affiche un message « perdu ». Le SOS reste
        accessible. Aucun micro/caméra activé.
      </Text>

      <View style={s.sep} />
      <Text style={s.subtitle}>Consentement & âge (RGPD)</Text>
      <View style={[s.focusRow, { paddingVertical: 4 }]}>
        <Text style={s.muted}>Année de naissance</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TextInput
            style={s.time}
            value={year}
            onChangeText={setYear}
            placeholder="2014"
            placeholderTextColor={t.muted}
            keyboardType="number-pad"
            maxLength={4}
          />
          <Text style={s.pauseYes} onPress={saveYear}>
            OK
          </Text>
        </View>
      </View>
      {sup && (
        <Text style={s.muted}>
          {sup.active
            ? "✅ Supervision autorisée (2 tuteurs + mineur)"
            : `Tuteurs ayant consenti : ${sup.consents}/2${sup.is_minor ? "" : " · âge non confirmé"}`}
        </Text>
      )}
      <Text style={[s.pauseYes, { marginTop: 6 }]} onPress={consent}>
        Je consens à la supervision
      </Text>
    </View>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    card: {
      backgroundColor: t.card,
      borderRadius: 18,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: t.border,
    },
    title: { fontSize: 15, fontWeight: "800", color: t.text, marginBottom: 10 },
    subtitle: { fontSize: 13, fontWeight: "700", color: t.text, marginBottom: 6 },
    muted: { color: t.muted, fontSize: 12 },
    sep: { height: 1, backgroundColor: t.border, marginVertical: 12 },
    pauseBox: {
      backgroundColor: t.cardAlt,
      borderRadius: 12,
      padding: 10,
      marginBottom: 10,
    },
    pauseRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 4,
    },
    pauseTxt: { color: t.text, fontSize: 13, fontWeight: "600", flex: 1 },
    pauseYes: { color: t.primary, fontWeight: "800", fontSize: 13 },
    pauseNo: { color: t.danger, fontWeight: "800", fontSize: 13 },
    focusRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 8,
    },
    focusLabel: { fontSize: 14, color: t.text, fontWeight: "600" },
    focusRight: { flexDirection: "row", alignItems: "center", gap: 6 },
    time: {
      backgroundColor: t.cardAlt,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 5,
      width: 56,
      textAlign: "center",
      color: t.text,
      fontSize: 13,
    },
    dash: { color: t.muted },
    appRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 7,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border,
    },
    appName: { fontSize: 14, color: t.text, flex: 1, marginRight: 10 },
  });
}
