import { useEffect, useState } from "react";
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
import MapView, { Marker } from "react-native-maps";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import {
  createChild,
  fetchChildren,
  sendCommand,
  subscribeLocations,
  type ChildWithLocation,
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
      const fn =
        mode === "in"
          ? supabase.auth.signInWithPassword({ email, password })
          : supabase.auth.signUp({ email, password });
      const { error } = await fn;
      if (error) throw error;
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
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  async function refresh() {
    try {
      setChildren(await fetchChildren());
    } catch (e: any) {
      console.warn(e.message);
    }
  }

  useEffect(() => {
    refresh();
    const unsub = subscribeLocations(refresh);
    return unsub;
  }, []);

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
  const initialRegion = located[0]
    ? {
        latitude: located[0].lat!,
        longitude: located[0].lng!,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }
    : {
        latitude: 5.345, // Abidjan par défaut
        longitude: -4.024,
        latitudeDelta: 0.2,
        longitudeDelta: 0.2,
      };

  return (
    <View style={{ flex: 1 }}>
      <MapView style={{ flex: 1 }} initialRegion={initialRegion}>
        {located.map((c) => (
          <Marker
            key={c.id}
            coordinate={{ latitude: c.lat!, longitude: c.lng! }}
            title={c.name}
            description={c.located_at ?? undefined}
          />
        ))}
      </MapView>

      <SafeAreaView edges={["bottom"]} style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Text style={styles.h2}>Enfants</Text>
          <TouchableOpacity onPress={() => setAdding((v) => !v)}>
            <Text style={styles.link}>{adding ? "Annuler" : "+ Ajouter"}</Text>
          </TouchableOpacity>
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
              <View style={{ flex: 1 }}>
                <Text style={styles.childName}>{item.name}</Text>
                <Text style={styles.muted}>
                  {item.pairing_code
                    ? `Code : ${item.pairing_code}`
                    : item.located_at
                      ? `Vu ${new Date(item.located_at).toLocaleTimeString("fr-FR")}`
                      : "Jamais localisé"}
                  {item.last_battery_pct != null
                    ? ` · ${item.last_battery_pct}%`
                    : ""}
                </Text>
              </View>
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
});
