import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Session } from "@supabase/supabase-js";
import { MapPanel, type MapPanelHandle } from "../components/map-panel";
import { ChildReport } from "../components/child-report";
import { registerForPush } from "../../lib/push";
import { supabase } from "../../lib/supabase";
import {
  createChild,
  createPlace,
  fetchChildren,
  fetchGeofenceFeed,
  fetchPlaces,
  fetchSos,
  resolveSos,
  sendCommand,
  subscribeGeofence,
  subscribeLocations,
  subscribeSos,
  type ChildWithLocation,
  type PlaceOverview,
} from "../../lib/api";

export default function HomeScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setSession(s)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  // Register for background push once signed in (no-op on web).
  useEffect(() => {
    if (session) registerForPush();
  }, [session]);

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6B4EE6" />
      </View>
    );
  }
  return session ? <Dashboard /> : <Auth />;
}

// ---------------------------------------------------------------------------
function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(mode: "in" | "up") {
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // If email confirmation is ON, signUp returns no session.
        if (!data.session) {
          Alert.alert(
            "Compte créé",
            "Confirme ton email puis connecte-toi. (Ou désactive la confirmation email dans Supabase pour les tests.)"
          );
        }
      }
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.center}>
      <Text style={styles.h1}>KidsGuard</Text>
      <Text style={styles.muted}>Espace parent</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Mot de passe"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <TouchableOpacity
        style={[styles.btn, busy && styles.dim]}
        disabled={busy}
        onPress={() => submit("in")}
      >
        <Text style={styles.btnText}>Se connecter</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => submit("up")} style={{ marginTop: 14 }}>
        <Text style={styles.link}>Créer un compte</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
function Dashboard() {
  const [children, setChildren] = useState<ChildWithLocation[]>([]);
  const [places, setPlaces] = useState<PlaceOverview[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const mapRef = useRef<MapPanelHandle>(null);
  const lastTap = useRef<{ id: string; t: number }>({ id: "", t: 0 });
  const [reportChild, setReportChild] = useState<ChildWithLocation | null>(null);

  function onChildPress(item: ChildWithLocation) {
    const now = Date.now();
    const isDouble = lastTap.current.id === item.id && now - lastTap.current.t < 320;
    if (isDouble) {
      lastTap.current = { id: "", t: 0 };
      setReportChild(item);
      return;
    }
    lastTap.current = { id: item.id, t: now };
    if (item.lat != null && item.lng != null) {
      mapRef.current?.centerOn([item.lng, item.lat], 16);
    } else {
      Alert.alert(item.name, "Pas encore de position.");
    }
  }

  async function refresh() {
    try {
      const [ch, pl] = await Promise.all([fetchChildren(), fetchPlaces()]);
      setChildren(ch);
      setPlaces(pl);
    } catch (e: any) {
      console.warn(e.message);
    }
  }

  useEffect(() => {
    refresh();
    // Auto-detect: poll every 15s so the child appears/updates on its own,
    // even without realtime or a manual refresh (no SOS needed).
    const poll = setInterval(refresh, 15_000);
    // Defensive: a realtime hiccup must never crash the dashboard.
    const unsubs: Array<() => void> = [];
    try {
      unsubs.push(subscribeLocations(refresh));
      unsubs.push(
        subscribeGeofence(async () => {
          const feed = await fetchGeofenceFeed(1).catch(() => []);
          const last = feed[0];
          if (last) {
            const verb = last.direction === "enter" ? "arrivé(e) à" : "parti(e) de";
            Alert.alert("Alerte zone", `${last.child_name} est ${verb} ${last.place_name}`);
          }
        })
      );
      unsubs.push(
        subscribeSos(async () => {
          const feed = await fetchSos(1).catch(() => []);
          const last = feed[0];
          if (last && !last.resolved_at) {
            Alert.alert("🆘 SOS", `${last.child_name} a déclenché une alerte SOS !`, [
              { text: "Plus tard", style: "cancel" },
              { text: "Marquer résolu", onPress: () => resolveSos(last.id).catch(() => {}) },
            ]);
          }
        })
      );
    } catch (e: any) {
      console.warn("realtime subscribe failed:", e?.message);
    }
    return () => {
      clearInterval(poll);
      for (const u of unsubs) {
        try {
          u();
        } catch {}
      }
    };
  }, []);

  async function addZone() {
    const c = await mapRef.current?.getCenter();
    if (!c) {
      Alert.alert("Carte", "Carte pas prête — réessaie.");
      return;
    }
    const [lng, lat] = c;
    try {
      await createPlace({
        name: "Nouvelle zone",
        kind: "other",
        lng,
        lat,
        radiusM: 150,
      });
      await refresh();
      Alert.alert("Zone créée", "Rayon 150 m au centre de la carte.");
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? String(e));
    }
  }

  async function handleAdd() {
    if (!name.trim()) return;
    try {
      const child = await createChild(name.trim());
      setName("");
      setAdding(false);
      await refresh();
      Alert.alert(
        "Code d'association",
        `Saisis ce code dans l'app de ${child.name} (valide 30 min) :\n\n${child.pairing_code}`
      );
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? String(e));
    }
  }

  const located = children.filter((c) => c.lat != null && c.lng != null);
  const center: [number, number] = located[0]
    ? [located[0].lng!, located[0].lat!]
    : [-4.024, 5.345]; // Abidjan par défaut

  return (
    <View style={{ flex: 1 }}>
      <MapPanel ref={mapRef} located={located} places={places} center={center} />

      <SafeAreaView edges={["bottom"]} style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Text style={styles.h2}>Enfants</Text>
          <View style={{ flexDirection: "row", gap: 16 }}>
            <TouchableOpacity onPress={refresh}>
              <Text style={styles.link}>↻</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={addZone}>
              <Text style={styles.link}>+ Zone</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setAdding((v) => !v)}>
              <Text style={styles.link}>{adding ? "Annuler" : "+ Enfant"}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {adding && (
          <View style={styles.addRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder="Prénom"
              value={name}
              onChangeText={setName}
            />
            <TouchableOpacity style={styles.btnSm} onPress={handleAdd}>
              <Text style={styles.btnText}>OK</Text>
            </TouchableOpacity>
          </View>
        )}

        <FlatList
          data={children}
          keyExtractor={(c) => c.id}
          style={{ maxHeight: 240 }}
          ListEmptyComponent={
            <Text style={styles.muted}>Aucun enfant. Ajoute-en un.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.childRow}>
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={() => onChildPress(item)}
                activeOpacity={0.6}
              >
                <Text style={styles.childName}>{item.name}</Text>
                <Text style={styles.muted}>
                  {item.pairing_code
                    ? `Code : ${item.pairing_code}`
                    : item.located_at
                      ? `Vu ${new Date(item.located_at).toLocaleTimeString("fr-FR")} · tap = carte, double = rapport`
                      : "Jamais localisé"}
                  {item.last_battery_pct != null
                    ? ` · ${item.last_battery_pct}%`
                    : ""}
                </Text>
              </TouchableOpacity>
              {!item.pairing_code && (
                <TouchableOpacity
                  style={styles.ring}
                  onPress={() =>
                    sendCommand(item.id, "ring").catch((e) =>
                      Alert.alert("Erreur", e.message)
                    )
                  }
                >
                  <Text style={styles.ringText}>🔔</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        />

        <TouchableOpacity
          onPress={() => supabase.auth.signOut()}
          style={{ marginTop: 8 }}
        >
          <Text style={[styles.muted, { textAlign: "center" }]}>
            Déconnexion
          </Text>
        </TouchableOpacity>
      </SafeAreaView>

      {reportChild && (
        <ChildReport
          childId={reportChild.id}
          childName={reportChild.name}
          onClose={() => setReportChild(null)}
        />
      )}
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
  h1: { fontSize: 32, fontWeight: "800", color: "#1f2440" },
  h2: { fontSize: 18, fontWeight: "700", color: "#1f2440" },
  muted: { color: "#6b7280", fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    minWidth: 260,
    fontSize: 16,
  },
  btn: {
    backgroundColor: "#6B4EE6",
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 999,
    marginTop: 8,
  },
  btnSm: {
    backgroundColor: "#6B4EE6",
    paddingHorizontal: 18,
    justifyContent: "center",
    borderRadius: 10,
  },
  dim: { opacity: 0.5 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  link: { color: "#6B4EE6", fontWeight: "600" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 12,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  addRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  childRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  childName: { fontSize: 16, fontWeight: "600", color: "#1f2440" },
  ring: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f3f0ff",
    alignItems: "center",
    justifyContent: "center",
  },
  ringText: { fontSize: 18 },
  pin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#6B4EE6",
    borderWidth: 3,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  pinTxt: { fontSize: 18 },
  zoneDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(107,78,230,0.25)",
    borderWidth: 2,
    borderColor: "#6B4EE6",
  },
});
