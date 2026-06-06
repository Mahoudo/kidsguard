# screen-time (module natif local)

Capacité **temps d'écran** côté enfant. Autolinké par Expo (dossier `modules/`).

## API JS

```ts
import {
  hasUsagePermission,
  openUsageAccessSettings,
  getUsageToday,
} from "./modules/screen-time";
```

| Fonction | Android | iOS |
|---|---|---|
| `hasUsagePermission()` | AppOps `GET_USAGE_STATS` | stub `false` |
| `openUsageAccessSettings()` | ouvre Réglages accès usage | no-op |
| `getUsageToday()` | usage/app depuis minuit | `[]` (stub) |

## État

- **Android** : lecture usage fonctionnelle (`UsageStatsManager`). Blocage
  d'app (`AccessibilityService` + foreground service) = à implémenter.
- **iOS** : stubs. Nécessite l'entitlement Apple **Family Controls**
  (`FamilyControls` / `DeviceActivity` / `ManagedSettings`) — à demander.

## Build

Ne marche **pas** dans Expo Go. Requiert un build dev client :
`cd apps/child && npx expo run:android`. `requireNativeModule('ScreenTime')`
lève une erreur si lancé sans le binaire natif.

## Reste à faire

1. Android : `AccessibilityService` pour détecter l'app au premier plan +
   overlay/kill quand une limite est dépassée.
2. Sync limites depuis Supabase (table `app_limits` à créer).
3. iOS : flux autorisation FamilyControls + `ManagedSettingsStore.shield`.
4. UI parent : écran « Limites par app » (cf screenshots Findmykids).
