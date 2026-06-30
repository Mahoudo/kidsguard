import { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import type { ChildWithLocation, PlaceOverview } from "../../lib/api";

// Native Google Maps (Maps SDK for Android — free, best local coverage in CI).
// The API key is injected at build from a CI secret (see app.config.js).

export interface MapPanelHandle {
  getCenter(): Promise<[number, number] | null>;
  centerOn(center: [number, number], zoom?: number): void;
}

interface Props {
  located: ChildWithLocation[];
  places: PlaceOverview[];
  center: [number, number]; // [lng, lat]
}

export const MapPanel = forwardRef<MapPanelHandle, Props>(function MapPanel(
  { located, places, center },
  ref
) {
  const mapRef = useRef<MapView | null>(null);

  useImperativeHandle(ref, () => ({
    async getCenter() {
      try {
        const cam = await mapRef.current?.getCamera();
        const c = cam?.center;
        if (c) return [c.longitude, c.latitude];
      } catch {}
      return null;
    },
    centerOn(c, zoom = 15) {
      mapRef.current?.animateCamera(
        { center: { latitude: c[1], longitude: c[0] }, zoom },
        { duration: 500 }
      );
    },
  }));

  return (
    <MapView
      ref={mapRef}
      provider={PROVIDER_GOOGLE}
      style={{ flex: 1 }}
      initialRegion={{
        latitude: center[1],
        longitude: center[0],
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      }}
      toolbarEnabled={false}
    >
      {places.map((p) => (
        <Marker
          key={p.id}
          identifier={`zone-${p.id}`}
          coordinate={{ latitude: p.lat, longitude: p.lng }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
        >
          <View style={styles.zoneDot} />
        </Marker>
      ))}
      {located.map((c) => (
        <Marker
          key={c.id}
          identifier={`kid-${c.id}`}
          coordinate={{ latitude: c.lat!, longitude: c.lng! }}
          tracksViewChanges={false}
        >
          <View style={styles.pin}>
            <Text style={styles.pinTxt}>🧒</Text>
          </View>
        </Marker>
      ))}
    </MapView>
  );
});

const styles = StyleSheet.create({
  pin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#5B4BE3",
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
    borderColor: "#5B4BE3",
  },
});
