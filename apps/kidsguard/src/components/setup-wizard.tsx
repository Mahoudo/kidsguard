import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export type SetupStep = {
  key: string;
  icon: string;
  title: string;
  desc: string;
  hint?: string;
  ok: boolean;
  onActivate: () => void;
};

/**
 * Guided permission setup for the child device. Detects each special access in
 * real time, explains it in kid/parent-friendly language, deep-links to the
 * right Settings screen, and shows progress. The device isn't "ready" until
 * every step is green — this is what makes the app actually work in the field
 * (especially on MIUI/aggressive OEMs).
 */
export function SetupWizard({
  steps,
  onRecheck,
  onSkip,
}: {
  steps: SetupStep[];
  onRecheck: () => void;
  onSkip?: () => void;
}) {
  const done = steps.filter((s) => s.ok).length;
  const total = steps.length;
  const allDone = done === total;

  return (
    <ScrollView contentContainerStyle={s.c}>
      <Text style={s.mascot}>🦁</Text>
      <Text style={s.h1}>Configuration de l'appareil</Text>
      <Text style={s.sub}>
        Active ces réglages pour que Gospion protège bien l'enfant.
      </Text>

      <View style={s.barWrap}>
        <View style={[s.barFill, { width: `${(done / total) * 100}%` }]} />
      </View>
      <Text style={s.count}>
        {allDone ? "Tout est prêt ✅" : `Étape ${done}/${total}`}
      </Text>

      {steps.map((st, i) => (
        <View key={st.key} style={[s.card, st.ok && s.cardOk]}>
          <View style={s.row}>
            <Text style={s.stepIcon}>{st.ok ? "✅" : st.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.stepTitle}>
                {i + 1}. {st.title}
              </Text>
              <Text style={s.stepDesc}>{st.desc}</Text>
              {!st.ok && st.hint ? <Text style={s.hint}>💡 {st.hint}</Text> : null}
            </View>
          </View>
          {!st.ok && (
            <TouchableOpacity style={s.btn} onPress={st.onActivate} activeOpacity={0.85}>
              <Text style={s.btnTxt}>Activer</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      <TouchableOpacity style={s.recheck} onPress={onRecheck} activeOpacity={0.8}>
        <Text style={s.recheckTxt}>🔄 J'ai activé, revérifier</Text>
      </TouchableOpacity>

      {allDone ? (
        <Text style={s.doneNote}>Parfait ! L'appareil est protégé. 💚</Text>
      ) : onSkip ? (
        <TouchableOpacity onPress={onSkip} style={{ padding: 10, marginBottom: 24 }}>
          <Text style={s.skipTxt}>Passer pour l'instant →</Text>
        </TouchableOpacity>
      ) : (
        <Text style={s.requiredNote}>
          🚀 Le démarrage automatique est requis pour continuer (touche « Activer » ci-dessus).
        </Text>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  c: { padding: 22, paddingTop: 56, alignItems: "center", backgroundColor: "#FFF6F0", minHeight: "100%" },
  mascot: { fontSize: 52 },
  h1: { fontSize: 24, fontWeight: "900", color: "#1f2440", marginTop: 6, textAlign: "center" },
  sub: { fontSize: 14, color: "#6b7280", marginTop: 6, marginBottom: 18, textAlign: "center" },
  barWrap: { width: "100%", height: 10, borderRadius: 999, backgroundColor: "#E7E3F5", overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: "#1FC9A0", borderRadius: 999 },
  count: { fontSize: 13, fontWeight: "700", color: "#5B4BE3", marginTop: 8, marginBottom: 14 },
  card: {
    width: "100%", backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: "#eee",
  },
  cardOk: { borderColor: "#1FC9A055", backgroundColor: "#F2FCF6" },
  row: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  stepIcon: { fontSize: 26 },
  stepTitle: { fontSize: 15, fontWeight: "800", color: "#1f2440" },
  stepDesc: { fontSize: 13, color: "#6b7280", marginTop: 3, lineHeight: 19 },
  hint: { fontSize: 12, color: "#b45309", marginTop: 6 },
  btn: { backgroundColor: "#5B4BE3", borderRadius: 999, paddingVertical: 11, alignItems: "center", marginTop: 12 },
  btnTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
  recheck: { marginTop: 8, padding: 12 },
  recheckTxt: { color: "#5B4BE3", fontWeight: "700", fontSize: 14 },
  doneNote: { fontSize: 15, color: "#1FC9A0", fontWeight: "700", marginTop: 8, marginBottom: 30 },
  skipTxt: { color: "#9aa0ad", fontSize: 14, fontWeight: "600" },
  requiredNote: {
    fontSize: 13, color: "#b45309", fontWeight: "700", textAlign: "center",
    marginTop: 4, marginBottom: 28, paddingHorizontal: 12, lineHeight: 19,
  },
});
