import "react-native-url-polyfill/auto";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  isTracking,
  sendCurrentPosition,
  startTracking,
  stopTracking,
} from "./lib/location";
import { startCommandListener, stopCommandListener } from "./lib/commands";
import { raiseSos } from "./lib/sos";
import { giveConsent, hasConsent } from "./lib/consent";
import { hasUsagePermission, openUsageAccessSettings, syncUsage } from "./lib/usage";
import { Component, type ReactNode } from "react";

// App-wide error boundary: any render/effect crash shows a message, not a close.
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <View style={styles.center}>
          <Text style={styles.title}>Oups, une erreur</Text>
          <Text style={[styles.subtitle, { color: "#b91c1c" }]}>
            {this.state.error.message}
          </Text>
          <TouchableOpacity style={styles.btn} onPress={() => this.setState({ error: null })}>
            <Text style={styles.btnText}>Réessayer</Text>
          </TouchableOpacity>
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

function AppInner() {
  const [loading, setLoading] = useState(true);
  const [consent, setConsent] = useState(false);
  const [childId, setChildId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [tracking, setTracking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [usageOk, setUsageOk] = useState(false);

  useEffect(() => {
    (async () => {
      setConsent(await hasConsent());
      const id = await getStoredChildId();
      setChildId(id);
      if (id) {
        setTracking(await isTracking());
        sendCurrentPosition(); // push a fresh position on app open
      }
      setLoading(false);
    })();
  }, []);

  // Command listener runs while paired.
  useEffect(() => {
    if (childId) {
      startCommandListener(childId);
      return () => stopCommandListener();
    }
  }, [childId]);

  // Screen-time: report per-app usage to the parent (Android, needs access).
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
      Alert.alert("Échec", e.message ?? String(e));
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
      Alert.alert("SOS envoyé", "Tes parents ont été alertés.");
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
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6B4EE6" />
      </View>
    );
  }

  if (!consent) {
    return (
      <ScrollView contentContainerStyle={styles.center}>
        <StatusBar style="dark" />
        <Text style={styles.title}>Avant de commencer</Text>
        <Text style={styles.consentText}>
          Cette application partage ta position avec tes parents pour ta
          sécurité. Tes parents peuvent voir où tu es, recevoir une alerte
          quand tu arrives ou quittes certains lieux, et faire sonner ton
          téléphone.{"\n\n"}En continuant, tu acceptes ce partage. Tu peux
          mettre le partage en pause à tout moment.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={handleConsent}>
          <Text style={styles.btnText}>J'accepte</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (!childId) {
    return (
      <View style={styles.center}>
        <StatusBar style="dark" />
        <Text style={styles.title}>Associer cet appareil</Text>
        <Text style={styles.subtitle}>
          Saisis le code à 6 chiffres affiché sur le téléphone du parent.
        </Text>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="000000"
          textAlign="center"
        />
        <TouchableOpacity
          style={[styles.btn, busy && styles.btnDisabled]}
          onPress={handlePair}
          disabled={busy || code.length !== 6}
        >
          <Text style={styles.btnText}>{busy ? "..." : "Associer"}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <StatusBar style="dark" />
      <Text style={styles.title}>{tracking ? "🟢 Actif" : "⚪ En pause"}</Text>
      <Text style={styles.subtitle}>
        {tracking
          ? "Ta position est partagée avec tes parents."
          : "Le partage de position est en pause."}
      </Text>

      <TouchableOpacity style={styles.sos} onPress={handleSos}>
        <Text style={styles.sosText}>SOS</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btn, busy && styles.btnDisabled]}
        onPress={toggleTracking}
        disabled={busy}
      >
        <Text style={styles.btnText}>
          {tracking ? "Mettre en pause" : "Reprendre"}
        </Text>
      </TouchableOpacity>
      <View style={styles.usageBox}>
        <Text style={styles.usageLabel}>
          Temps d'écran {usageOk ? "✅ partagé" : "non activé"}
        </Text>
        {!usageOk && (
          <TouchableOpacity onPress={grantUsage} style={styles.usageBtn}>
            <Text style={styles.usageBtnTxt}>Autoriser l'accès à l'usage</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity onPress={handleUnpair} style={styles.link}>
        <Text style={styles.linkText}>Dissocier cet appareil</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flexGrow: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: { fontSize: 28, fontWeight: "800", color: "#1f2440", marginBottom: 8 },
  subtitle: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 24,
  },
  consentText: {
    fontSize: 15,
    color: "#374151",
    lineHeight: 22,
    marginBottom: 28,
    textAlign: "left",
  },
  input: {
    fontSize: 32,
    letterSpacing: 8,
    borderWidth: 2,
    borderColor: "#6B4EE6",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginBottom: 24,
    minWidth: 220,
  },
  btn: {
    backgroundColor: "#6B4EE6",
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 999,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  sos: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
    shadowColor: "#ef4444",
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  sosText: { color: "#fff", fontSize: 32, fontWeight: "900" },
  link: { marginTop: 20 },
  linkText: { color: "#9ca3af", fontSize: 14 },
  usageBox: { marginTop: 24, alignItems: "center" },
  usageLabel: { color: "#6b7280", fontSize: 13, marginBottom: 8 },
  usageBtn: {
    borderWidth: 1.5,
    borderColor: "#6B4EE6",
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 999,
  },
  usageBtnTxt: { color: "#6B4EE6", fontWeight: "700", fontSize: 13 },
});
