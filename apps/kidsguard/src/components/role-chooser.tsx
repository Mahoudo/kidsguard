import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

/** First-launch screen: pick whether this device is the parent or the child. */
export function RoleChooser({
  onChoose,
}: {
  onChoose: (role: "parent" | "child") => void;
}) {
  return (
    <View style={s.c}>
      <Text style={s.logo}>🦁</Text>
      <Text style={s.title}>KidsGuard</Text>
      <Text style={s.sub}>Qui utilise cet appareil ?</Text>

      <TouchableOpacity
        style={[s.btn, { backgroundColor: "#6B4EE6" }]}
        onPress={() => onChoose("parent")}
        activeOpacity={0.85}
      >
        <Text style={s.btnTxt}>👨‍👩‍👧 Je suis le parent</Text>
        <Text style={s.btnSub}>Tableau de bord, carte, contrôles</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[s.btn, { backgroundColor: "#FF7A59" }]}
        onPress={() => onChoose("child")}
        activeOpacity={0.85}
      >
        <Text style={s.btnTxt}>🧒 C'est le téléphone de l'enfant</Text>
        <Text style={s.btnSub}>À associer avec le code des parents</Text>
      </TouchableOpacity>

      <Text style={s.note}>Tu pourras changer plus tard en réinstallant.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: "#FFF6EC", alignItems: "center", justifyContent: "center", padding: 28 },
  logo: { fontSize: 64 },
  title: { fontSize: 30, fontWeight: "900", color: "#1f2440", marginTop: 6 },
  sub: { fontSize: 15, color: "#6b7280", marginTop: 8, marginBottom: 28 },
  btn: { width: "100%", maxWidth: 420, borderRadius: 20, padding: 20, marginTop: 14, alignItems: "center" },
  btnTxt: { color: "#fff", fontSize: 18, fontWeight: "800" },
  btnSub: { color: "#ffffffcc", fontSize: 13, marginTop: 4 },
  note: { color: "#9aa0ad", fontSize: 12, marginTop: 24 },
});
