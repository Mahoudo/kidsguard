import "react-native-url-polyfill/auto";
import { Component, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { getStoredChildId, pairWithCode, unpair } from "./lib/pairing";
import {
  ensureTracking,
  isTracking,
  sendCurrentPosition,
  startTracking,
  stopTracking,
} from "./lib/location";
import { startCommandListener, stopCommandListener } from "./lib/commands";
import { raiseSos, sendSosSms } from "./lib/sos";
import { sendCheckin, type Mood } from "./lib/checkin";
import { cacheEmergencyPhone } from "./lib/emergency";
import { getLockState, subscribeLock } from "./lib/lock";
import {
  isAccessibilityEnabled,
  openAccessibilitySettings,
  isAdminActive,
  requestAdmin,
  isBatteryUnrestricted,
  requestDisableBatteryOptimization,
  syncBlockRules,
} from "./lib/blocker";
import { giveConsent, hasConsent } from "./lib/consent";
import { hasUsagePermission, openUsageAccessSettings, syncUsage } from "./lib/usage";

const C = {
  bg: "#FFF6EC",
  ink: "#2A2342",
  muted: "#8A85A0",
  violet: "#6C5CE7",
  sun: "#FFB02E",
  mascot: "#FFE08A",
  green: "#2BD67B",
  sos: "#FF5A5F",
  card: "#FFFFFF",
};

const SHARED = [
  { icon: "📍", label: "Ma position", detail: "Temps réel + zones (école, maison…)" },
  { icon: "🔋", label: "Ma batterie", detail: "Niveau de batterie" },
  { icon: "🆘", label: "Mes SOS", detail: "Seulement quand TU appuies sur SOS" },
  { icon: "💚", label: "Mes check-ins", detail: "Seulement quand TU dis que tout va bien" },
  { icon: "⏱️", label: "Temps d'écran", detail: "Temps par appli (si activé)" },
  { icon: "🛡️", label: "Limites d'apps", detail: "Posées par tes parents (Focus, blocage)" },
];
const NOT_SHARED = [
  "Tes SMS", "Tes appels", "Tes photos",
  "Ton micro", "Ta caméra", "Tes messages privés",
];

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <View style={s.screen}>
          <Mascot face="😟" />
          <Text style={s.h1}>Oups…</Text>
          <Text style={s.sub}>{this.state.error.message}</Text>
          <BigButton label="Réessayer" color={C.violet} onPress={() => this.setState({ error: null })} />
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}

function Mascot({ face = "🦁" }: { face?: string }) {
  return (
    <View style={s.mascotWrap}>
      <View style={s.mascotRing}>
        <Text style={{ fontSize: 74 }}>{face}</Text>
      </View>
      <Text style={s.mascotName}>Léo veille sur toi</Text>
    </View>
  );
}

function BigButton({
  label,
  color,
  onPress,
  disabled,
}: {
  label: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[s.bigBtn, { backgroundColor: color }, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
    >
      <Text style={s.bigBtnTxt}>{label}</Text>
    </TouchableOpacity>
  );
}

function AppInner() {
  const [loading, setLoading] = useState(true);
  const [consent, setConsent] = useState(false);
  const [childId, setChildId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [tracking, setTracking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [usageOk, setUsageOk] = useState(false);
  const [locked, setLocked] = useState(false);
  const [accessOk, setAccessOk] = useState(false);
  const [adminOk, setAdminOk] = useState(false);
  const [batteryOk, setBatteryOk] = useState(false);
  const [showShared, setShowShared] = useState(false);

  useEffect(() => {
    (async () => {
      setConsent(await hasConsent());
      const id = await getStoredChildId();
      setChildId(id);
      if (id) {
        await ensureTracking(); // silently resume the heartbeat if permitted
        setTracking(await isTracking());
        cacheEmergencyPhone(); // cache for offline SOS-by-SMS
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!childId) return;
    startCommandListener(childId, {
      onCall: (room) => {
        Alert.alert("📹 Appel", "Tes parents veulent t'appeler.", [
          { text: "Plus tard", style: "cancel" },
          {
            text: "Répondre",
            onPress: () => Linking.openURL(`https://meet.jit.si/${room}`),
          },
        ]);
      },
    });
    getLockState().then(setLocked);
    try {
      setAccessOk(isAccessibilityEnabled());
      setAdminOk(isAdminActive());
      setBatteryOk(isBatteryUnrestricted());
    } catch {}
    syncBlockRules();
    const unsubLock = subscribeLock(childId, (v) => {
      setLocked(v);
      syncBlockRules();
    });
    const blockIv = setInterval(() => {
      try {
        setAccessOk(isAccessibilityEnabled());
        setAdminOk(isAdminActive());
      } catch {}
      syncBlockRules();
    }, 30_000);
    return () => {
      stopCommandListener();
      unsubLock();
      clearInterval(blockIv);
    };
  }, [childId]);

  useEffect(() => {
    if (!childId) return;
    let ok = false;
    try {
      ok = hasUsagePermission();
    } catch {}
    setUsageOk(ok);
    if (ok) syncUsage();
    const iv = setInterval(() => {
      try {
        if (hasUsagePermission()) {
          setUsageOk(true);
          syncUsage();
        }
      } catch {}
    }, 60_000);
    return () => clearInterval(iv);
  }, [childId]);

  function grantUsage() {
    try {
      openUsageAccessSettings();
    } catch (e: any) {
      Alert.alert("Indisponible", e?.message ?? "Fonction Android uniquement.");
    }
  }

  async function handleConsent() {
    await giveConsent();
    setConsent(true);
  }

  async function handlePair() {
    setBusy(true);
    try {
      const id = await pairWithCode(code.trim());
      setChildId(id);
      await startTracking();
      setTracking(true);
    } catch (e: any) {
      Alert.alert("Oups", e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleTracking() {
    setBusy(true);
    try {
      if (tracking) {
        await stopTracking();
        setTracking(false);
      } else {
        await startTracking();
        setTracking(true);
      }
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSos() {
    if (!childId) return;
    try {
      await raiseSos(childId);
      Alert.alert("SOS envoyé ✅", "Tes parents sont prévenus, ne bouge pas.");
    } catch (e: any) {
      // No data connection? Fall back to an emergency SMS.
      const sent = await sendSosSms().catch(() => false);
      if (sent) {
        Alert.alert("SOS par SMS 📩", "Pas d'internet — envoie le SMS d'urgence (déjà prêt).");
      } else {
        Alert.alert("Erreur", e.message ?? String(e));
      }
    }
  }

  async function doCheckin(kind: "safe" | "arrived", mood?: Mood) {
    try {
      await sendCheckin(kind, mood);
      Alert.alert("Envoyé 💚", "Tes parents savent que tout va bien.");
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? String(e));
    }
  }

  async function handleUnpair() {
    await stopTracking();
    stopCommandListener();
    await unpair();
    setChildId(null);
    setTracking(false);
    setCode("");
  }

  if (loading) {
    return (
      <View style={s.screen}>
        <ActivityIndicator size="large" color={C.violet} />
      </View>
    );
  }

  // ----- Consent -----
  if (!consent) {
    return (
      <ScrollView contentContainerStyle={s.screen}>
        <StatusBar style="dark" />
        <Mascot face="🦁" />
        <Text style={s.h1}>Salut, moi c'est Léo&nbsp;!</Text>
        <View style={s.card}>
          <Text style={s.cardText}>
            Cette appli aide tes parents à savoir que tu es{" "}
            <Text style={{ fontWeight: "800" }}>en sécurité</Text>.{"\n\n"}
            • Ils voient où tu es 📍{"\n"}
            • Tu as un bouton <Text style={{ fontWeight: "800" }}>SOS</Text> si tu as un souci 🆘{"\n"}
            • Tu peux mettre en pause quand tu veux ⏸️
          </Text>
        </View>
        <BigButton label="OK, j'ai compris !" color={C.green} onPress={handleConsent} />
      </ScrollView>
    );
  }

  // ----- Pairing -----
  if (!childId) {
    return (
      <ScrollView contentContainerStyle={s.screen}>
        <StatusBar style="dark" />
        <Mascot face="🦁" />
        <Text style={s.h1}>On se connecte&nbsp;?</Text>
        <Text style={s.sub}>Tape le code à 6 chiffres de tes parents 👇</Text>
        <TextInput
          style={s.code}
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="• • • • • •"
          placeholderTextColor="#CFC8E0"
          textAlign="center"
        />
        <BigButton
          label={busy ? "…" : "Connecter"}
          color={C.violet}
          onPress={handlePair}
          disabled={busy || code.length !== 6}
        />
      </ScrollView>
    );
  }

  // ----- Transparency: what is shared -----
  if (showShared) {
    return (
      <ScrollView contentContainerStyle={s.screen}>
        <StatusBar style="dark" />
        <Mascot face="🦁" />
        <Text style={s.h1}>Ce que je partage</Text>
        <Text style={s.sub}>En toute transparence 💚</Text>
        <View style={s.card}>
          {SHARED.map((x) => (
            <View key={x.label} style={s.shareRow}>
              <Text style={{ fontSize: 24 }}>{x.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.shareLabel}>{x.label}</Text>
                <Text style={s.shareDetail}>{x.detail}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={[s.card, { borderWidth: 2, borderColor: C.green }]}>
          <Text style={s.shareLabel}>Tes parents ne voient JAMAIS :</Text>
          {NOT_SHARED.map((x) => (
            <Text key={x} style={{ color: C.muted, lineHeight: 24 }}>
              🚫 {x}
            </Text>
          ))}
        </View>
        <BigButton label="Retour" color={C.violet} onPress={() => setShowShared(false)} />
      </ScrollView>
    );
  }

  // ----- Locked by parent -----
  if (locked) {
    return (
      <View style={s.screen}>
        <StatusBar style="dark" />
        <Mascot face="🔒" />
        <Text style={s.h1}>Téléphone en pause</Text>
        <Text style={s.sub}>
          Tes parents ont mis ton téléphone en pause. Ça reviendra bientôt 💚
        </Text>
        <TouchableOpacity style={s.sos} onPress={handleSos} activeOpacity={0.85}>
          <Text style={s.sosTxt}>SOS</Text>
          <Text style={s.sosSub}>en cas de danger</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ----- Active -----
  return (
    <ScrollView contentContainerStyle={s.screen}>
      <StatusBar style="dark" />
      <Mascot face={tracking ? "🦁" : "😴"} />
      <Text style={s.h1}>{tracking ? "Tout va bien !" : "En pause"}</Text>
      <Text style={s.sub}>
        {tracking
          ? "Tes parents savent que tu es en sécurité 💚"
          : "Le partage est en pause ⏸️"}
      </Text>

      <TouchableOpacity style={s.sos} onPress={handleSos} activeOpacity={0.85}>
        <Text style={s.sosTxt}>SOS</Text>
        <Text style={s.sosSub}>en cas de danger</Text>
      </TouchableOpacity>

      <View style={s.checkCard}>
        <Text style={s.checkTitle}>Dis que tout va bien 💚</Text>
        <View style={s.moodRow}>
          <TouchableOpacity style={s.moodBtn} onPress={() => doCheckin("safe", "happy")}>
            <Text style={s.moodEmoji}>😀</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.moodBtn} onPress={() => doCheckin("safe", "ok")}>
            <Text style={s.moodEmoji}>🙂</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.moodBtn} onPress={() => doCheckin("safe", "sad")}>
            <Text style={s.moodEmoji}>😟</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={s.arrivedBtn} onPress={() => doCheckin("arrived")}>
          <Text style={s.arrivedTxt}>📍 Je suis arrivé(e)</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={s.pausePill} onPress={toggleTracking} disabled={busy}>
        <Text style={s.pausePillTxt}>
          {tracking ? "⏸️  Mettre en pause" : "▶️  Reprendre"}
        </Text>
      </TouchableOpacity>

      <View style={s.usageChip}>
        <Text style={s.usageTxt}>
          ⏱️ Temps d'écran {usageOk ? "partagé ✅" : "non activé"}
        </Text>
        {!usageOk && (
          <TouchableOpacity onPress={grantUsage}>
            <Text style={s.usageLink}>Activer</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={[s.usageChip, { marginTop: 10 }]}>
        <Text style={s.usageTxt}>
          🛡️ Contrôle parental {accessOk ? "actif ✅" : "non activé"}
        </Text>
        {!accessOk && (
          <TouchableOpacity onPress={() => openAccessibilitySettings()}>
            <Text style={s.usageLink}>Activer</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={[s.usageChip, { marginTop: 10 }]}>
        <Text style={s.usageTxt}>
          🔒 Protection anti-retrait {adminOk ? "active ✅" : "non activée"}
        </Text>
        {!adminOk && (
          <TouchableOpacity onPress={() => requestAdmin()}>
            <Text style={s.usageLink}>Activer</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={[s.usageChip, { marginTop: 10 }]}>
        <Text style={s.usageTxt}>
          🔋 Rester connecté {batteryOk ? "OK ✅" : "à régler"}
        </Text>
        {!batteryOk && (
          <TouchableOpacity onPress={() => requestDisableBatteryOptimization()}>
            <Text style={s.usageLink}>Activer</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity onPress={() => setShowShared(true)} style={{ marginTop: 14 }}>
        <Text style={s.usageLink}>ℹ️ Ce que je partage</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={handleUnpair} style={{ marginTop: 16 }}>
        <Text style={s.unpair}>Dissocier cet appareil</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: {
    flexGrow: 1,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 26,
  },
  mascotWrap: { alignItems: "center", marginBottom: 14 },
  mascotRing: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: C.mascot,
    borderWidth: 5,
    borderColor: C.sun,
    alignItems: "center",
    justifyContent: "center",
  },
  mascotName: { marginTop: 8, color: C.muted, fontSize: 13, fontWeight: "600" },
  h1: { fontSize: 26, fontWeight: "900", color: C.ink, textAlign: "center", marginBottom: 6 },
  sub: { fontSize: 15, color: C.muted, textAlign: "center", marginBottom: 20, paddingHorizontal: 10 },
  card: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 20,
    marginBottom: 22,
    width: "100%",
    maxWidth: 380,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },
  cardText: { fontSize: 15, color: C.ink, lineHeight: 24 },
  code: {
    fontSize: 34,
    letterSpacing: 6,
    fontWeight: "800",
    color: C.ink,
    backgroundColor: C.card,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 20,
    minWidth: 260,
    marginBottom: 22,
    borderWidth: 2,
    borderColor: "#EEE6FB",
  },
  bigBtn: {
    paddingVertical: 17,
    paddingHorizontal: 44,
    borderRadius: 999,
    minWidth: 240,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  bigBtnTxt: { color: "#fff", fontSize: 18, fontWeight: "900" },
  sos: {
    width: 184,
    height: 184,
    borderRadius: 92,
    backgroundColor: C.sos,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 22,
    shadowColor: C.sos,
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  sosTxt: { color: "#fff", fontSize: 46, fontWeight: "900", letterSpacing: 2 },
  sosSub: { color: "#fff", fontSize: 13, fontWeight: "600", marginTop: 2, opacity: 0.95 },
  checkCard: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 16,
    marginBottom: 18,
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  checkTitle: { fontSize: 15, fontWeight: "800", color: C.ink, marginBottom: 12 },
  moodRow: { flexDirection: "row", gap: 14, marginBottom: 14 },
  moodBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  moodEmoji: { fontSize: 30 },
  arrivedBtn: {
    backgroundColor: C.green,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 999,
  },
  arrivedTxt: { color: "#fff", fontWeight: "800", fontSize: 15 },
  pausePill: {
    backgroundColor: C.card,
    paddingVertical: 13,
    paddingHorizontal: 26,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#EEE6FB",
  },
  pausePillTxt: { color: C.ink, fontWeight: "800", fontSize: 15 },
  usageChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
    backgroundColor: "#FFF",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  usageTxt: { color: C.muted, fontSize: 13, fontWeight: "600" },
  usageLink: { color: C.violet, fontSize: 13, fontWeight: "800" },
  shareRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  shareLabel: { fontWeight: "800", color: C.ink, fontSize: 14, marginBottom: 4 },
  shareDetail: { color: C.muted, fontSize: 12 },
  unpair: { color: "#C4BED6", fontSize: 13 },
});
