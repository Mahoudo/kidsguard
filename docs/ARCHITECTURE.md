# Architecture — KidsGuard

## Vue d'ensemble

```
┌─────────────┐         ┌──────────────────────┐         ┌─────────────┐
│  App PARENT │  RLS    │       SUPABASE        │   RLS   │ App ENFANT  │
│  (Expo)     │◄───────►│  Postgres + PostGIS   │◄───────►│  (Expo)     │
│             │ realtime│  Realtime / Edge / Push│  RPC    │  (agent)    │
└─────────────┘         └──────────────────────┘         └─────────────┘
       ▲                          │                              │
       │   push (Expo/FCM/APNs)   │   géofence calc (edge)       │ GPS fond
       └──────────────────────────┘                              ▼
                                                         expo-location +
                                                         expo-task-manager
```

## Flux clés

### 1. Pairing
1. Parent → `create_child(family, name)` → reçoit `pairing_code` (6 chiffres, 30 min).
2. App enfant → `supabase.auth.signInAnonymously()` → obtient un uid.
3. App enfant → `pair_device(code)` → lie `device_user_id = auth.uid()`.
4. Désormais le device enfant peut `ingest_location` et lire ses `commands`.

### 2. Géolocalisation temps réel
1. App enfant : tâche fond `expo-task-manager` → toutes N sec/m → `ingest_location`.
2. `ingest_location` insère dans `locations` + met à jour `children.last_*`.
3. App parent : `supabase.channel` sur `locations`/`children` → carte live.

### 3. Géofencing (Phase 2)
- Edge Function `on-location` (trigger DB ou webhook) : pour chaque ping,
  `ST_DWithin(geog, place.center, radius_m)` sur les `places` de la famille.
- Transition (dedans/dehors change) → insert `geofence_events` → push parent.

### 4. Commandes (sonnerie, locate now)
- Parent insère `commands(type='ring')`.
- App enfant écoute realtime sur `commands` (filtre son child_id) → exécute →
  passe `status='done'`. Push réveille l'app si en veille.

### 5. SOS
- Bouton enfant → `sos_alerts` insert + position → push prioritaire parent.

## Décisions techniques

| Sujet | Choix | Raison |
|------|-------|--------|
| Front mobile | Expo (Dev Client) | proximité JS, prebuild pour modules natifs |
| Backend | Supabase | Postgres+PostGIS+Realtime+RLS+Edge, déjà maîtrisé |
| Auth enfant | anonymous sign-in | pas de compte, lié au device, RLS scoping |
| Géo | `geography(Point,4326)` + GiST | distances métriques correctes, `ST_DWithin` |
| Push | Expo Push (MVP) → FCM/APNs | rapide d'abord, contrôle ensuite |
| Temps écran | module natif (Kotlin/Swift) | aucune API JS ; Android d'abord |

## Limites plateformes (temps écran — Phase 4)

- **Android** : `UsageStatsManager` (PACKAGE_USAGE_STATS), `AccessibilityService`
  pour bloquer. Foreground service persistant. Risque revue « stalkerware ».
- **iOS** : `FamilyControls` / `DeviceActivity` / `ManagedSettings`. Nécessite
  l'**entitlement Family Controls** (demande à Apple, délai, refus possible).
  Pas de lecture libre de l'usage d'autres apps.
