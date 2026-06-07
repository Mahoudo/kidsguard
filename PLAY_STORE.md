# KidsGuard — Publication Play Store

## 0. La clé de signature (À NE JAMAIS PERDRE)

Fichier : `Downloads/kidsguard-upload.keystore`
Mot de passe (store + key) : `KidsGuardUpload2026`
Alias : `kidsguard`

> ⚠️ **Sauvegarde ce fichier + ce mot de passe** (cloud privé, gestionnaire de mots de passe).
> Si tu le perds, tu ne pourras plus mettre à jour l'app sur le Play Store.
> (Si tu actives "Play App Signing", Google garde la clé finale ; cette clé reste ta clé d'upload.)

Secrets GitHub déjà configurés : `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`.

## 1. Construire les AAB signés

GitHub → Actions → **Build AAB (Play Store)** → Run workflow.
→ produit `kidsguard-child-aab` + `kidsguard-parent-aab` (artifacts à télécharger).

## 2. Compte Play Console

- https://play.google.com/console → créer un compte développeur (**25 $ une fois**).
- Crée **2 applications** : "KidsGuard" (parent) et "KidsGuard Enfant" (child).

## 3. Politique de confidentialité (obligatoire)

Fichier prêt : `docs/privacy.html`.
Héberge-le à une URL publique. Options :
- Rendre le repo **public** + activer GitHub Pages (Settings → Pages → branche main /docs) → `https://mahoudo.github.io/kidsguard/privacy.html`
- OU coller le contenu sur Netlify Drop / un site gratuit.
Mets l'URL dans Play Console → Règlement de confidentialité.

## 4. Formulaires Play Console (par app)

- **Sécurité des données** : déclare position (oui), aucune publicité, chiffré en transit, suppression possible.
- **Contenu** : classification du contenu (questionnaire).
- **Public cible** : l'app ENFANT vise les **mineurs** → politique **Families**. Sois précis : c'est un outil de contrôle parental, pas de pub ciblée enfant.
- **Autorisations sensibles** — prépare une justification courte pour chacune :
  - `ACCESS_BACKGROUND_LOCATION` : suivi de sécurité par le parent (vidéo de démo souvent demandée).
  - **AccessibilityService** : formulaire dédié — déclarer "contrôle parental : appliquer les limites d'apps et le verrouillage définis par le parent, avec consentement".
  - **Device Admin** : anti-désinstallation + verrouillage parental.
  - `PACKAGE_USAGE_STATS`, `READ_MEDIA_IMAGES`, `RECEIVE_BOOT_COMPLETED` : justifier (temps d'écran, confidentialité photo on-device, reprise au démarrage).

## 5. ⚠️ Risques de revue (à connaître)

1. **AccessibilityService pour bloquer des apps** = motif #1 de rejet des apps de contrôle parental (Google réserve l'accessibilité au handicap). Family Link utilise des API système. **Plan B si rejet** : retirer le blocage par accessibilité du build Play (garder géoloc + zones + SOS + temps d'écran + verrou via Device Admin), et garder le blocage d'apps en version "entreprise / appareil dédié" hors Play.
2. **Apps de surveillance** : Google exige que ce soit un vrai contrôle **parental transparent** (consentement enfant visible) — c'est notre cas. Pas de mode caché.
3. **Background location** : revue manuelle, fournir une démo.

## 6. Stratégie recommandée

- Publie d'abord l'app **PARENT** (faible risque : tableau de bord).
- Pour l'app **ENFANT** : soumets en **test fermé** d'abord (testeurs), corrige les retours de revue, puis production.
- Garde la version **APK hors-Play** (GitHub Release) pour les appareils dédiés / si rejet du blocage.
