import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ChildWithLocation, PlaceOverview } from "../../lib/api";

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
  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: OSM_STYLE,
      center,
      zoom: 12,
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markers.current.forEach((x) => x.remove());
    markers.current = [];
    for (const p of places) {
      const d = document.createElement("div");
      Object.assign(d.style, {
        width: "22px",
        height: "22px",
        borderRadius: "50%",
        background: "rgba(107,78,230,0.25)",
        border: "2px solid #6B4EE6",
      });
      markers.current.push(new maplibregl.Marker({ element: d }).setLngLat([p.lng, p.lat]).addTo(m));
    }
    for (const c of located) {
      markers.current.push(
        new maplibregl.Marker({ color: "#6B4EE6" }).setLngLat([c.lng!, c.lat!]).addTo(m)
      );
    }
  }, [located, places]);

  useImperativeHandle(ref, () => ({
    async getCenter() {
      const c = map.current?.getCenter();
      return c ? [c.lng, c.lat] : null;
    },
  }));

  return <div ref={el} style={{ width: "100%", height: "100%", minHeight: 320 }} />;
});
