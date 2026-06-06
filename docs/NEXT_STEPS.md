# Étapes suivantes — à faire après le reboot

Docker Desktop est installé mais le daemon n'est pas démarré et le PATH n'est
pas rafraîchi. **Redémarre la machine** (ou déconnexion/reconnexion), puis :

## 1. Démarrer Docker

1. Lance **Docker Desktop**, accepte les conditions, attends « Engine running ».
2. Vérifie : `docker version` doit afficher Server.

## 2. Installer la CLI Supabase

Pas besoin d'install globale, `npx` suffit :

```bash
cd C:\Users\serge\dev\kidsguard
npx supabase --version
```

(ou via scoop : `scoop install supabase`)

## 3. Lancer la base locale

```bash
npx supabase init        # crée supabase/config.toml (garde nos migrations/)
npx supabase start       # démarre Postgres + Auth + Realtime (Docker)
npx supabase db reset    # applique migrations/0001..0003
npx supabase status      # affiche API URL + anon key
```

### ⚠️ Activer l'auth anonyme (pour l'app enfant)

Dans `supabase/config.toml`, section `[auth]` :

```toml
[auth]
enable_anonymous_sign_ins = true
```

Puis `npx supabase stop && npx supabase start` (ou `db reset`).

## 4. Brancher les apps

Copie l'URL + anon key de `supabase status` dans les deux `.env` :

```bash
# apps/parent/.env  ET  apps/child/.env
EXPO_PUBLIC_SUPABASE_URL=http://<TON_IP_LAN>:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

> Sur téléphone physique, remplace `127.0.0.1` par l'**IP LAN** du PC
> (ex. `192.168.1.x`) sinon le tel ne joint pas Supabase local.

## 5. Lancer (Dev Client requis, pas Expo Go)

Modules natifs (location fond, maps) → build dev client :

```bash
# une fois par app
cd apps/parent && npx expo run:android   # ou run:ios sur Mac
cd apps/child  && npx expo run:android
```

## 6. Tester le flux Phase 1

1. App **parent** → créer compte → « + Ajouter » un enfant → note le **code 6 chiffres**.
2. App **enfant** (autre device/émulateur) → saisir le code → autoriser la
   localisation → statut « 🟢 Actif ».
3. App **parent** → la carte affiche le marqueur enfant, mise à jour temps réel.

## Bloquants connus
- **Google Maps Android** : remplace `TODO_GOOGLE_MAPS_ANDROID_API_KEY` dans
  `apps/parent/app.json` par une vraie clé (sinon carte grise sur Android).
- iOS map via Apple Maps marche sans clé.
- Géoloc **fond** Android : autoriser « Toujours » dans les réglages.
