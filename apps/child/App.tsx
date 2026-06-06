import "react-native-url-polyfill/auto";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { getStoredChildId, pairWithCode, unpair } from "./lib/pairing";
import { isTracking, startTracking, stopTracking } from "./lib/location";

export default function App() {
  const [loading, setLoading] = useState(true);
  const [childId, setChildId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [tracking, setTracking] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const id = await getStoredChildId();
      setChildId(id);
      if (id) setTracking(await isTracking());
      setLoading(false);
    })();
  }, []);

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

  async function handleUnpair() {
    await stopTracking();
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
      <TouchableOpacity
        style={[styles.btn, busy && styles.btnDisabled]}
        onPress={toggleTracking}
        disabled={busy}
      >
        <Text style={styles.btnText}>
          {tracking ? "Mettre en pause" : "Reprendre"}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleUnpair} style={styles.link}>
        <Text style={styles.linkText}>Dissocier cet appareil</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
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
  link: { marginTop: 20 },
  linkText: { color: "#9ca3af", fontSize: 14 },
});
