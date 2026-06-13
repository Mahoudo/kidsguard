import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Map, Camera, Marker } from "@maplibre/maplibre-react-native";
import type { ChildWithLocation, PlaceOverview } from "../../lib/api";

// Free OpenStreetMap raster tiles — no API key, no billing.
const OSM_STYLE: any = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export interface MapPanelHandle {
  getCenter(): Promise<[number, number] | null>;
  centerOn(center: [number, number], zoom?: number): void;
}

interface Props {
  located: ChildWithLocation[];
  places: PlaceOverview[];
  center: [number, number];
}

export const MapPanel = forwardRef<MapPanelHandle, Props>(function MapPanel(
  { located, places, center },
  ref
) {
  const mapRef = useRef<any>(null);
  const [cam, setCam] = useState<{ center: [number, number]; zoom: number }>({
    center,
    zoom: 12,
  });
  useImperativeHandle(ref, () => ({
    async getCenter() {
      try {
        const c = await mapRef.current?.getCenter?.();
        if (Array.isArray(c)) return [c[0], c[1]];
        if (c) return [c.longitude ?? c.lng, c.latitude ?? c.lat];
      } catch {}
      return null;
    },
    centerOn(c, zoom = 15) {
      setCam({ center: c, zoom });
    },
  }));

  return (
    <Map ref={mapRef} style={{ flex: 1 }} mapStyle={OSM_STYLE}>
      <Camera center={cam.center} zoom={cam.zoom} />
      {places.map((p) => (
        <Marker key={p.id} id={`zone-${p.id}`} lngLat={[p.lng, p.lat]}>
          <View style={styles.zoneDot} />
        </Marker>
      ))}
      {located.map((c) => (
        <Marker key={c.id} id={`kid-${c.id}`} lngLat={[c.lng!, c.lat!]}>
          <View style={styles.pin}>
            <Text style={styles.pinTxt}>🧒</Text>
          </View>
        </Marker>
      ))}
    </Map>
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
