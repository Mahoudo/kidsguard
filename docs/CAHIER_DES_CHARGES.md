# KidsGuard — Cahier des charges (actualisé)

> App de **sécurité familiale & contrôle parental transparent**, optimisée pour le
> marché UEMOA (Côte d'Ivoire et voisins). Positionnement assumé : l'enfant
> **sait et participe** — pas du logiciel espion.

---

## 1. Vision & positionnement

| | |
|---|---|
| **But** | Permettre aux parents de protéger et localiser leur enfant, gérer son temps d'écran et le joindre en cas d'urgence, **de façon transparente et consentie**. |
| **Marché** | UEMOA / Afrique de l'Ouest. Contraintes : data/batterie limitées, téléphones Android d'entrée de gamme (Xiaomi/Redmi/Tecno/Infinix), famille élargie, fallback SMS. |
| **Différenciation** | Transparence (l'enfant voit ce qui est partagé), participation de l'enfant (check-in, SOS, consentement vidéo), optimisation locale. |
| **Ligne rouge** | **Aucune surveillance clandestine** (micro/caméra cachés, lecture de messages, scan galerie). Stalkerware = bannissement stores + illégal. Refusé par conception. |

---

## 2. Acteurs & rôles

- **Parent** : compte Supabase (email + mot de passe). Tableau de bord, carte, contrôles.
- **Enfant** : session **anonyme** Supabase, liée à une ligne `children` via code d'appairage (8 caractères), `device_user_id`.
- **Tuteur (guardian)** : adulte de confiance invité dans une famille (grands-parents…), accès partagé.
- **Co-parentalité** : plusieurs tuteurs gèrent conjointement (`family_members`).
- **App unifiée** : un seul APK `com.kidsguard.app`, le rôle (parent/enfant) est choisi au 1er lancement.

---

## 3. Stack technique

| Couche | Choix |
|---|---|
| Front mobile | **Expo SDK 56 / React Native 0.85 / React 19**, expo-router, monorepo pnpm + turbo (`apps/kidsguard`) |
| Backend | **Supabase** : Postgres + PostGIS, RLS, Realtime, pg_net (push), pg_cron |
| Carte | **MapLibre + tuiles OpenStreetMap** (zéro clé, zéro carte bancaire) |
| Module natif | Kotlin local `modules/screen-time` (AccessibilityService, DeviceAdmin, UsageStats, overlay) |
| Vidéo | **react-native-webrtc** + signaling Supabase Realtime + **TURN Metered** |
| Push | expo-notifications + FCM (réveil silencieux via pg_net → exp.host) |
| Auth enfant | Sessions anonymes Supabase |
| Build/CI | **GitHub Actions** (repo public), `expo prebuild` + `gradlew assembleRelease` signé, **GitHub Releases** |

---

## 4. Fonctionnalités

### 4.1 Localisation
- Position temps réel (foreground-service location), historique de trajet.
- **Géofencing** : zones (maison/école), alertes entrée/sortie.
- File hors-ligne (`offlineQueue`) : positions renvoyées au retour du réseau.
- Batterie + dernier vu remontés.

### 4.2 Sécurité enfant
- **SOS** : gros bouton enfant → alerte + position au parent (vibration, notif, dédup). Fallback **SMS** hors-data (numéro d'urgence en cache).
- **Cercle de confiance** : contacts (voisin, oncle) recevant un SMS au SOS.
- **Check-in** : "Je vais bien / Je suis arrivé" + humeur 😀🙂😟.
- **Mode perdu** : message sur l'écran enfant.
- **Alerte changement de SIM** (signal de vol).

### 4.3 Temps d'écran & contrôle
- **Plafond quotidien** (minutes/jour) + **temps bonus** (tâches → minutes du jour). Verrouillage automatique au cap (overlay « Temps d'écran terminé »).
- **Modes Focus** : Études / Sommeil (plages horaires), **mode école auto** (géofence).
- **Blocage par application** (AccessibilityService).
- **Validation d'installation** : l'enfant remonte ses apps, le parent voit les **nouvelles** (badge 🆕) et peut les bloquer.
- **Verrouillage à distance** : overlay opaque plein écran (sans PIN, MIUI-proof) + `lockNow` si PIN.
- **Anti-désinstallation** : Device Admin + garde anti-uninstall (accessibilité).
- **Filtrage web (DNS)** : deep-link DNS privé → résolveur filtrant (CleanBrowsing Family).

### 4.4 Babyphone vidéo (transparent)
- Parent demande la vidéo → **l'enfant doit accepter** (dialogue) → flux caméra.
- **Bannière « 🔴 Diffusion en cours »** incontournable côté enfant.
- **Two-way** : l'enfant voit aussi le parent (vignette PiP des 2 côtés).
- WebRTC peer-to-peer, signaling Supabase Realtime, **TURN** pour réseaux différents.

### 4.5 Côté parent
- Tableau de bord (carte, enfants, batterie, en-ligne), **fiche d'actions** par enfant (carte, appel, sonner, rapport, babyphone, verrouiller, supprimer).
- **Faire sonner** le téléphone (sirène à volume forcé, même silencieux).
- **Appel vidéo** (Jitsi) + **Babyphone** (WebRTC).
- **Rapport** : score sécurité, résumé jour/semaine, temps d'écran, zones, alertes.
- **Cercle de confiance**, **inviter un tuteur**, **rejoindre une famille**.
- **Digest hebdomadaire** (pg_cron).

### 4.6 RGPD / conformité
- Écran de **consentement** enfant à l'appairage.
- Notification persistante de tracking (non masquable).
- **Refus assumé** : surveillance SMS/appels/galerie, micro/caméra clandestins.

---

## 5. Architecture & sécurité

### 5.1 Base de données
- Tables clés : `families`, `children`, `locations` (geography + GiST), `places`, `geofence_events`, `commands`, `sos_alerts`, `app_limits`, `app_usage`, `checkins`, `pause_requests`, `family_members`, `screen_bonus`, `installed_apps`, `signaling` (broadcast realtime).
- **RLS sur 16+ tables** (scopées owner/membre via `owns_child` / `owns_family` / `is_child_device`).
- **RPC `SECURITY DEFINER`** avec contrôle d'autorisation pour chaque mutation.
- ~34 migrations (`supabase/migrations/0001 → 0035`).

### 5.2 Durcissements sécurité (audit)
- **Appairage** : code 8 caractères non-ambigus (~656 milliards de combos) + rate-limit/lockout.
- **C1** : `revoke execute` sur les helpers definer internes (sinon exfiltration des push tokens via `rpc()`).
- **H2** : `revoke insert/update/delete` sur `children` → mutations via RPC only.
- **H1** : invite tuteur **usage unique**.
- Keystore signé `CN=HAT-immo`, mot de passe en secret GitHub.

### 5.3 Survie sur OEM agressifs (MIUI/HyperOS/Transsion)
- Service accessibilité **crash-proof** (try/catch global).
- **Overlay verrou** via `TYPE_ACCESSIBILITY_OVERLAY` (pas de startActivity en arrière-plan, bloqué par MIUI).
- Étape wizard **Autostart** (deep-link `com.miui.securitycenter`) + batterie sans restriction.
- Réveil par **push FCM** + rejeu des commandes en attente.
- Sync résilient : lecture `locked` isolée des colonnes optionnelles (anti dérive de migration).

---

## 6. Build & déploiement

- **CI** : GitHub Actions (`build-kidsguard.yml`, `workflow_dispatch`), repo **public** (minutes illimitées).
- **Sortie** : APK signé → **GitHub Release `unified-v1`**.
- **Install** : adb (parent), ou lien APK direct ; sur MIUI activer « Installer via USB » (compte Mi).
- iOS : non couvert (Apple Developer 99$/an requis).

---

## 7. Limites connues & à faire

- **TURN** : clé Metered actuellement dans le repo public → à **proxy via Edge Function** pour la prod.
- **Filtrage DNS** : réglage **guidé** (Android n'autorise pas le forçage sans Device Owner).
- **Babyphone** : signaling broadcast non RLS-gaté (childId = secret) → durcir avec Realtime Authorization.
- **iOS** : à implémenter (FamilyControls, entitlement Apple).
- **Verrou écran-éteint réel** : nécessite un PIN sur l'appareil enfant (sinon overlay seul).
- **Stores** : écran de divulgation + consentement serveur à finaliser avant publication.

---

## 8. Roadmap (prochaines vagues)

1. Proxy TURN + clés côté serveur (sécu prod).
2. Filtrage de contenu renforcé (VPN local ou DNS managé).
3. Récompenses / défis éducatifs (déblocage par exercice).
4. Rapports par email.
5. iOS (FamilyControls).
6. Durcissement signaling vidéo (Realtime Authorization).
7. Mode Device Owner (provisioning) pour un contrôle total (verrou/DNS forcés).

---

*Document généré le 2026-06-22. Reflète l'état du code sur la branche `main` (repo Mahoudo/kidsguard).*
