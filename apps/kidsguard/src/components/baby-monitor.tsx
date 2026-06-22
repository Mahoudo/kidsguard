import { useEffect } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RTCView } from "react-native-webrtc";
import { useTheme } from "../theme";
import { useParentMonitor } from "../lib-rtc/useParentMonitor";

/**
 * Parent baby-monitor screen. Requests the child's video (the child must accept)
 * and shows the live feed once consent is granted. No frame before consent.
 */
export function BabyMonitor({
  childId,
  childName,
  onClose,
}: {
  childId: string;
  childName: string;
  onClose: () => void;
}) {
  const t = useTheme();
  const { phase, remoteStream, localStream, start, stop } = useParentMonitor(childId);

  useEffect(() => {
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    stop();
    onClose();
  }

  return (
    <Modal visible animationType="slide" onRequestClose={close}>
      <SafeAreaView style={[s.c, { backgroundColor: t.bg }]} edges={["top", "bottom"]}>
        <View style={s.head}>
          <TouchableOpacity onPress={close}>
            <Text style={[s.back, { color: t.primary }]}>‹ Fermer</Text>
          </TouchableOpacity>
          <Text style={[s.title, { color: t.text }]}>📹 {childName}</Text>
          <View style={{ width: 64 }} />
        </View>

        <View style={s.body}>
          {phase === "live" && remoteStream ? (
            <View style={{ flex: 1 }}>
              <RTCView
                streamURL={(remoteStream as any).toURL()}
                style={s.video}
                objectFit="cover"
              />
              {localStream && (
                <RTCView
                  streamURL={(localStream as any).toURL()}
                  style={s.selfPip}
                  objectFit="cover"
                  mirror
                />
              )}
            </View>
          ) : (
            <View style={s.center}>
              <Text style={[s.status, { color: t.text }]}>
                {phase === "requesting" && "En attente de l'accord de l'enfant…"}
                {phase === "declined" && "L'enfant a refusé le partage vidéo."}
                {phase === "idle" && "Connexion…"}
              </Text>
              {phase === "declined" && (
                <TouchableOpacity onPress={start} style={[s.retry, { backgroundColor: t.primary }]}>
                  <Text style={s.retryTxt}>Redemander</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        <Text style={[s.note, { color: t.muted }]}>
          L'enfant voit clairement quand la vidéo est partagée et peut l'arrêter.
        </Text>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  c: { flex: 1 },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  back: { fontSize: 16, fontWeight: "700", width: 64 },
  title: { fontSize: 17, fontWeight: "800" },
  body: { flex: 1, padding: 12 },
  video: { flex: 1, borderRadius: 16, backgroundColor: "#000" },
  selfPip: {
    position: "absolute",
    right: 12,
    bottom: 12,
    width: 96,
    height: 140,
    borderRadius: 10,
    backgroundColor: "#000",
    borderWidth: 2,
    borderColor: "#fff",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  status: { fontSize: 16, textAlign: "center", paddingHorizontal: 24 },
  retry: { borderRadius: 999, paddingVertical: 12, paddingHorizontal: 24 },
  retryTxt: { color: "#fff", fontWeight: "800" },
  note: { fontSize: 12, textAlign: "center", padding: 16 },
});
