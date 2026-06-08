// Daily / weekly narrative summary from legitimate signals only.
// Rule-based (transparent, no external AI, no extra data collection).

export interface SummaryInput {
  name: string;
  period: "day" | "week";
  enters: { place: string }[]; // geofence 'enter' events in period
  exits: { place: string }[]; // geofence 'exit' events in period
  sos: { resolved: boolean }[];
  checkins: number;
  screenMs: number;
  topApp?: string | null;
  activeDays?: number; // for week
}

export interface Summary {
  title: string;
  lines: string[];
  narrative: string;
}

const dur = (ms: number) => {
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m}min`;
};

export function generateSummary(i: SummaryInput): Summary {
  const isWeek = i.period === "week";
  const title = isWeek ? "Résumé de la semaine" : "Résumé du jour";

  const sosOpen = i.sos.filter((s) => !s.resolved).length;
  const sosTotal = i.sos.length;
  const lines: string[] = [];

  // movements
  const places = Array.from(new Set([...i.enters, ...i.exits].map((e) => e.place)));
  if (i.enters.length || i.exits.length) {
    lines.push(`🚶 ${i.enters.length} arrivée(s), ${i.exits.length} départ(s)` + (places.length ? ` (${places.slice(0, 3).join(", ")})` : ""));
  } else {
    lines.push("🚶 Aucun passage de zone enregistré");
  }

  // screen time
  if (i.screenMs > 0) {
    const label = isWeek ? "Écran (semaine)" : "Écran (jour)";
    lines.push(`⏱️ ${label} : ${dur(i.screenMs)}` + (i.topApp ? ` · top : ${i.topApp}` : ""));
  } else {
    lines.push("⏱️ Pas de données d'écran");
  }

  // check-ins
  if (i.checkins > 0) lines.push(`💚 ${i.checkins} check-in "je vais bien"`);

  // alerts
  if (sosTotal > 0) {
    lines.push(`🆘 ${sosTotal} SOS${sosOpen ? ` · ${sosOpen} NON résolu(s) !` : " (résolus)"}`);
  } else {
    lines.push("✅ Aucune alerte SOS");
  }

  if (isWeek && i.activeDays != null) {
    lines.unshift(`📅 ${i.activeDays}/7 jours actifs`);
  }

  // narrative
  let narrative = "";
  if (sosOpen > 0) {
    narrative = `${i.name} a un SOS non résolu — vérifie en priorité.`;
  } else if (isWeek) {
    const avg = i.activeDays && i.activeDays > 0 ? i.screenMs / i.activeDays : i.screenMs / 7;
    narrative = `Semaine calme pour ${i.name}. Écran moyen ~${dur(avg)}/jour.`;
    if (avg > 3 * 3600000) narrative += " Pense à fixer une limite d'écran.";
  } else {
    narrative =
      i.enters.length > 0
        ? `Journée normale pour ${i.name}, déplacements habituels.`
        : `Journée tranquille pour ${i.name}.`;
    if (i.screenMs > 3 * 3600000) narrative += " Temps d'écran un peu élevé aujourd'hui.";
  }

  return { title, lines, narrative };
}
