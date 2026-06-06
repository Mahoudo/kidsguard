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
import { registerForPush, presentSosAlert } from "../../lib/push";
import { supabase } from "../../lib/supabase";
import { useTheme, type Theme } from "../theme";
import {
  createChild,
  createGuardianInvite,
  createPlace,
  getEmergencyPhone,
  redeemGuardianInvite,
  setChildLock,
  setEmergencyPhone,
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
  const t = useTheme();
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

  useEffect(() => {
    if (session) registerForPush();
  }, [session]);

  if (!ready) {
    return (
      <View style={[styles0.fill, { backgroundColor: t.bg }]}>
        <ActivityIndicator size="large" color={t.primary} />
      </View>
    );
  }
  return session ? <Dashboard /> : <Auth />;
}

// ---------------------------------------------------------------------------
function Auth() {
  const t = useTheme();
  const s = makeStyles(t);
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
    <SafeAreaView style={[s.authWrap, { backgroundColor: t.bg }]}>
      <View style={s.logo}>
        <Text style={{ fontSize: 38 }}>🛡️</Text>
      </View>
      <Text style={s.brand}>KidsGuard</Text>
      <Text style={s.brandSub}>Protégez ce qui compte le plus</Text>

      <View style={s.authCard}>
        <TextInput
          style={s.input}
          placeholder="Email"
          placeholderTextColor={t.muted}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={s.input}
          placeholder="Mot de passe"
          placeholderTextColor={t.muted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <TouchableOpacity
          style={[s.btn, busy && s.dim]}
          disabled={busy}
          onPress={() => submit("in")}
        >
          <Text style={s.btnText}>{busy ? "…" : "Se connecter"}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => submit("up")} style={{ marginTop: 16 }}>
          <Text style={s.link}>Créer un compte</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
function Dashboard() {
  const t = useTheme();
  const s = makeStyles(t);
  const [children, setChildren] = useState<ChildWithLocation[]>([]);
  const [places, setPlaces] = useState<PlaceOverview[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [emPhone, setEmPhone] = useState<string | null>(null);
  const [editPhone, setEditPhone] = useState(false);
  const [phoneVal, setPhoneVal] = useState("");
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");

  async function inviteGuardian() {
    try {
      const code = await createGuardianInvite();
      Alert.alert(
        "Inviter un tuteur",
        `Donne ce code à l'autre adulte (valide 24h) :\n\n${code}\n\nIl le saisit dans "Rejoindre une famille".`
      );
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? String(e));
    }
  }

  async function joinFamily() {
    try {
      await redeemGuardianInvite(joinCode.trim());
      setJoinOpen(false);
      setJoinCode("");
      await refresh();
      Alert.alert("Famille rejointe ✅", "Tu suis maintenant ces enfants.");
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? String(e));
    }
  }
  const mapRef = useRef<MapPanelHandle>(null);
  const lastTap = useRef<{ id: string; t: number }>({ id: "", t: 0 });
  const lastSosId = useRef<string | null>(null);
  const [reportChild, setReportChild] = useState<ChildWithLocation | null>(null);

  // Detect a fresh SOS (via realtime OR poll). Vibrate + notify + alert once.
  async function checkSos(initial = false) {
    const feed = await fetchSos(1).catch(() => []);
    const last = feed[0];
    if (!last) return;
    if (initial) {
      lastSosId.current = last.id; // baseline: don't alert for past SOS on open
      return;
    }
    if (last.id !== lastSosId.current && !last.resolved_at) {
      lastSosId.current = last.id;
      presentSosAlert(last.child_name);
      Alert.alert("🆘 SOS", `${last.child_name} a déclenché une alerte SOS !`, [
        { text: "Plus tard", style: "cancel" },
        { text: "Marquer résolu", onPress: () => resolveSos(last.id).catch(() => {}) },
      ]);
    } else {
      lastSosId.current = last.id;
    }
  }

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
      const [ch, pl, ph] = await Promise.all([
        fetchChildren(),
        fetchPlaces(),
        getEmergencyPhone().catch(() => null),
      ]);
      setChildren(ch);
      setPlaces(pl);
      setEmPhone(ph);
    } catch (e: any) {
      console.warn(e.message);
    }
  }

  async function savePhone() {
    try {
      await setEmergencyPhone(phoneVal.trim());
      setEmPhone(phoneVal.trim() || null);
      setEditPhone(false);
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? String(e));
    }
  }

  useEffect(() => {
    refresh();
    checkSos(true); // baseline so we don't re-alert past SOS on open
    // Poll: auto-detect position updates AND new SOS even without realtime.
    const poll = setInterval(() => {
      refresh();
      checkSos();
    }, 15_000);
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
      unsubs.push(subscribeSos(() => checkSos()));
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
      await createPlace({ name: "Nouvelle zone", kind: "other", lng, lat, radiusM: 150 });
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
    : [-4.024, 5.345];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <MapPanel ref={mapRef} located={located} places={places} center={center} />

      <SafeAreaView edges={["bottom"]} style={s.sheet}>
        <View style={s.grabber} />
        <View style={s.sheetHeader}>
          <Text style={s.h2}>Ma famille</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pill t={t} label="↻" onPress={refresh} />
            <Pill t={t} label="+ Zone" onPress={addZone} />
            <Pill
              t={t}
              label={adding ? "Annuler" : "+ Enfant"}
              onPress={() => setAdding((v) => !v)}
              primary
            />
          </View>
        </View>

        {adding && (
          <View style={s.addRow}>
            <TextInput
              style={[s.input, { flex: 1, marginBottom: 0 }]}
              placeholder="Prénom de l'enfant"
              placeholderTextColor={t.muted}
              value={name}
              onChangeText={setName}
            />
            <TouchableOpacity style={s.btnSm} onPress={handleAdd}>
              <Text style={s.btnText}>OK</Text>
            </TouchableOpacity>
          </View>
        )}

        <FlatList
          data={children}
          keyExtractor={(c) => c.id}
          style={{ maxHeight: 280 }}
          ListEmptyComponent={
            <Text style={[s.muted, { paddingVertical: 14 }]}>
              Aucun enfant. Ajoute-en un pour commencer.
            </Text>
          }
          renderItem={({ item }) => {
            const online =
              !!item.last_seen_at &&
              Date.now() - new Date(item.last_seen_at).getTime() < 120_000;
            const initial = item.name.trim().charAt(0).toUpperCase() || "?";
            const batt = item.last_battery_pct;
            const battColor =
              batt == null ? t.muted : batt > 50 ? t.success : batt > 20 ? t.warning : t.danger;
            return (
              <View style={s.childCard}>
                <TouchableOpacity
                  style={s.childMain}
                  onPress={() => onChildPress(item)}
                  activeOpacity={0.7}
                >
                  <View style={s.avatar}>
                    <Text style={s.avatarTxt}>{initial}</Text>
                    <View
                      style={[
                        s.statusDot,
                        { backgroundColor: online ? t.success : t.muted },
                      ]}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.childName}>{item.name}</Text>
                    <Text style={s.childSub}>
                      {item.pairing_code
                        ? `Code : ${item.pairing_code}`
                        : item.located_at
                          ? `${online ? "En ligne" : "Vu"} ${new Date(item.located_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
                          : "Jamais localisé"}
                    </Text>
                  </View>
                  {batt != null && (
                    <View style={[s.battPill, { borderColor: battColor }]}>
                      <Text style={[s.battTxt, { color: battColor }]}>{batt}%</Text>
                    </View>
                  )}
                </TouchableOpacity>
                {!item.pairing_code && (
                  <>
                    <TouchableOpacity
                      style={s.ring}
                      onPress={async () => {
                        try {
                          await setChildLock(item.id, !item.locked);
                          await refresh();
                        } catch (e: any) {
                          Alert.alert("Erreur", e.message);
                        }
                      }}
                    >
                      <Text style={s.ringText}>{item.locked ? "🔒" : "🔓"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.ring}
                      onPress={() =>
                        sendCommand(item.id, "ring").catch((e) => Alert.alert("Erreur", e.message))
                      }
                    >
                      <Text style={s.ringText}>🔔</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            );
          }}
        />

        <View style={{ flexDirection: "row", justifyContent: "center", gap: 18, marginTop: 12 }}>
          <TouchableOpacity onPress={inviteGuardian}>
            <Text style={s.link}>👥 Inviter un tuteur</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setJoinOpen((v) => !v)}>
            <Text style={s.link}>Rejoindre une famille</Text>
          </TouchableOpacity>
        </View>
        {joinOpen && (
          <View style={[s.addRow, { marginTop: 8 }]}>
            <TextInput
              style={[s.input, { flex: 1, marginBottom: 0 }]}
              placeholder="Code tuteur (6 chiffres)"
              placeholderTextColor={t.muted}
              keyboardType="number-pad"
              maxLength={6}
              value={joinCode}
              onChangeText={setJoinCode}
            />
            <TouchableOpacity style={s.btnSm} onPress={joinFamily}>
              <Text style={s.btnText}>OK</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          onPress={() => {
            setPhoneVal(emPhone ?? "");
            setEditPhone((v) => !v);
          }}
          style={{ marginTop: 12 }}
        >
          <Text style={[s.muted, { textAlign: "center" }]}>
            📞 Numéro d'urgence (SOS hors-ligne) : {emPhone ?? "définir"}
          </Text>
        </TouchableOpacity>
        {editPhone && (
          <View style={[s.addRow, { marginTop: 8 }]}>
            <TextInput
              style={[s.input, { flex: 1, marginBottom: 0 }]}
              placeholder="+225 07 00 00 00 00"
              placeholderTextColor={t.muted}
              keyboardType="phone-pad"
              value={phoneVal}
              onChangeText={setPhoneVal}
            />
            <TouchableOpacity style={s.btnSm} onPress={savePhone}>
              <Text style={s.btnText}>OK</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity onPress={() => supabase.auth.signOut()} style={{ marginTop: 12 }}>
          <Text style={[s.muted, { textAlign: "center" }]}>Déconnexion</Text>
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

function Pill({
  t,
  label,
  onPress,
  primary,
}: {
  t: Theme;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: primary ? t.primary : t.cardAlt,
      }}
    >
      <Text
        style={{
          color: primary ? t.onPrimary : t.text,
          fontWeight: "700",
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles0 = StyleSheet.create({
  fill: { flex: 1, alignItems: "center", justifyContent: "center" },
});

function makeStyles(t: Theme) {
  return StyleSheet.create({
    authWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
    logo: {
      width: 84,
      height: 84,
      borderRadius: 24,
      backgroundColor: t.primarySoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 14,
    },
    brand: { fontSize: 30, fontWeight: "900", color: t.text, letterSpacing: -0.5 },
    brandSub: { fontSize: 14, color: t.muted, marginTop: 4, marginBottom: 26 },
    authCard: {
      width: "100%",
      maxWidth: 380,
      backgroundColor: t.card,
      borderRadius: 22,
      padding: 20,
      borderWidth: 1,
      borderColor: t.border,
    },
    input: {
      backgroundColor: t.cardAlt,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 13,
      marginBottom: 12,
      fontSize: 16,
      color: t.text,
    },
    btn: {
      backgroundColor: t.primary,
      paddingVertical: 15,
      borderRadius: 14,
      alignItems: "center",
      marginTop: 6,
      shadowColor: t.primary,
      shadowOpacity: 0.4,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    btnSm: {
      backgroundColor: t.primary,
      paddingHorizontal: 20,
      justifyContent: "center",
      borderRadius: 12,
    },
    dim: { opacity: 0.5 },
    btnText: { color: t.onPrimary, fontWeight: "800", fontSize: 15 },
    link: { color: t.primary, fontWeight: "700", textAlign: "center" },
    muted: { color: t.muted, fontSize: 13 },
    h2: { fontSize: 19, fontWeight: "800", color: t.text },
    sheet: {
      backgroundColor: t.card,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 6,
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: -4 },
      elevation: 16,
    },
    grabber: {
      width: 44,
      height: 5,
      borderRadius: 3,
      backgroundColor: t.border,
      alignSelf: "center",
      marginBottom: 12,
    },
    sheetHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    addRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
    childCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: t.cardAlt,
      borderRadius: 16,
      padding: 10,
      marginBottom: 8,
    },
    childMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
    avatar: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: t.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarTxt: { color: "#fff", fontWeight: "800", fontSize: 18 },
    statusDot: {
      position: "absolute",
      right: -1,
      bottom: -1,
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 2.5,
      borderColor: t.cardAlt,
    },
    childName: { fontSize: 16, fontWeight: "700", color: t.text },
    childSub: { fontSize: 13, color: t.muted, marginTop: 2 },
    battPill: {
      borderWidth: 1.5,
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 3,
    },
    battTxt: { fontSize: 12, fontWeight: "800" },
    ring: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: t.primarySoft,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 8,
    },
    ringText: { fontSize: 18 },
  });
}
