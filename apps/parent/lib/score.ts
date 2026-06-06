// Child safety score — computed ONLY from legitimate signals already collected
// (location freshness, battery, screen time, zones, alerts). No surveillance.
// The "summary" is a transparent rule-based generator (no external AI needed).

export interface ScorePart {
  key: string;
  label: string;
  value: number; // 0..100
  weight: number;
  note: string;
}

export interface SecurityScore {
  global: number;
  color: string;
  parts: ScorePart[];
  summary: string;
}

export interface ScoreInput {
  name: string;
  lastSeen: string | null;
  battery: number | null;
  screenMs: number;
  zonesCount: number;
  unresolvedSos: boolean;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function computeSecurityScore(input: ScoreInput): SecurityScore {
  const now = Date.now();

  // Localisation — freshness of last contact.
  let loc = 0;
  let locNote = "jamais localisé";
  if (input.lastSeen) {
    const min = (now - new Date(input.lastSeen).getTime()) / 60000;
    if (min < 5) {
      loc = 100;
      locNote = "localisé à l'instant";
    } else if (min < 60) {
      loc = 85;
      locNote = `vu il y a ${Math.round(min)} min`;
    } else if (min < 360) {
      loc = 55;
      locNote = "vu il y a quelques heures";
    } else {
      loc = 25;
      locNote = "pas vu depuis longtemps";
    }
  }

  // Batterie — low battery = risk of losing contact.
  let bat = 50;
  let batNote = "batterie inconnue";
  if (input.battery != null) {
    bat =
      input.battery > 50
        ? 100
        : input.battery > 20
          ? 50 + ((input.battery - 20) * 50) / 30
          : (input.battery * 30) / 20;
    bat = clamp(bat);
    batNote = `batterie ${input.battery}%`;
  }

  // Temps d'écran — less is better.
  const h = input.screenMs / 3600000;
  let scr = 85;
  let scrNote = "pas de données d'écran";
  if (input.screenMs > 0) {
    if (h < 1) {
      scr = 100;
      scrNote = `écran ${h.toFixed(1)} h`;
    } else if (h < 3) {
      scr = clamp(100 - (h - 1) * 20);
      scrNote = `écran ${h.toFixed(1)} h`;
    } else {
      scr = clamp(Math.max(40, 60 - (h - 3) * 10));
      scrNote = `écran élevé (${h.toFixed(1)} h)`;
    }
  }

  // Zones — safety geofences configured.
  const zon = input.zonesCount > 0 ? 100 : 60;
  const zonNote =
    input.zonesCount > 0
      ? `${input.zonesCount} zone(s) configurée(s)`
      : "aucune zone définie";

  // Alertes — unresolved SOS tanks the score.
  const alr = input.unresolvedSos ? 30 : 100;
  const alrNote = input.unresolvedSos ? "SOS non résolu !" : "aucune alerte";

  const parts: ScorePart[] = [
    { key: "loc", label: "Localisation", value: loc, weight: 30, note: locNote },
    { key: "bat", label: "Batterie", value: bat, weight: 15, note: batNote },
    { key: "scr", label: "Temps d'écran", value: scr, weight: 25, note: scrNote },
    { key: "zon", label: "Zones", value: zon, weight: 15, note: zonNote },
    { key: "alr", label: "Alertes", value: alr, weight: 15, note: alrNote },
  ];

  const global = clamp(
    parts.reduce((a, p) => a + p.value * p.weight, 0) /
      parts.reduce((a, p) => a + p.weight, 0)
  );
  const color = global >= 80 ? "#21C97A" : global >= 60 ? "#FFA726" : "#FF4D6D";

  const worst = [...parts].sort((a, b) => a.value - b.value)[0];
  let summary = `${input.name} : sécurité ${global}%. `;
  if (input.unresolvedSos) {
    summary += "⚠️ SOS en cours — vérifie tout de suite. ";
  } else if (global >= 80) {
    summary += "Tout va bien aujourd'hui. ";
  } else if (global >= 60) {
    summary += "Quelques points à surveiller. ";
  } else {
    summary += "Plusieurs points faibles — sois attentif. ";
  }
  if (worst.value < 70) {
    summary += `À améliorer : ${worst.label.toLowerCase()} (${worst.note}).`;
  }

  return { global, color, parts, summary };
}
