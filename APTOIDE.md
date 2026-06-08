# KidsGuard — Publication Aptoide (gratuit, sans carte)

Aptoide est un store Android populaire en Afrique de l'Ouest. **Publication gratuite, aucune carte bancaire.**

## 1. Compte
- https://www.aptoide.com → **Sign up** (email, gratuit).
- Ouvre ta **boutique** (store) — un espace Aptoide à ton nom.

## 2. Récupérer les APK signés
GitHub → Actions → **Build signed APK** → Run workflow →
télécharge `kidsguard-parent-signed-apk` et `kidsguard-child-signed-apk`.

## 3. Uploader (par app)
Dans ta boutique Aptoide → **Upload app** → choisis l'APK → remplis la fiche ci-dessous.

---

### Fiche — KidsGuard (PARENT)
- **Nom** : KidsGuard — Parent
- **Catégorie** : Outils / Famille
- **Courte description** : Veillez sur vos enfants : localisation, zones, SOS, temps d'écran.
- **Description** :
> KidsGuard est l'application des parents pour veiller sur leurs enfants en toute sérénité.
> • Localisation en temps réel sur carte
> • Zones de sécurité (école, maison) avec alertes d'arrivée/départ
> • Bouton SOS d'urgence
> • Temps d'écran et limites d'applications
> • Verrouillage à distance et mode perdu (anti-vol)
> • Plusieurs tuteurs par famille
> Contrôle parental transparent, respectueux de la vie privée. Aucun espionnage de SMS, appels, micro ou caméra.

### Fiche — KidsGuard Enfant (CHILD)
- **Nom** : KidsGuard — Enfant
- **Catégorie** : Outils / Famille
- **Courte description** : L'app installée sur le téléphone de l'enfant, associée à ses parents.
- **Description** :
> À installer sur le téléphone de l'enfant, puis associer avec le code fourni par l'app Parent.
> Partage la position avec les parents, bouton SOS, et applique les limites/horaires définis par les parents.
> Transparent : l'enfant voit ce qui est partagé et peut demander une pause. Aucun contenu privé (SMS, appels, photos, micro) n'est lu.

---

## 4. Politique de confidentialité
Mets l'URL de `docs/privacy.html` (hébergée) dans la fiche.

## 5. Note install (à dire aux utilisateurs)
Sur certains téléphones (surtout Xiaomi/MIUI), au 1er install :
- Autoriser "sources inconnues" pour Aptoide
- Si Play Protect prévient → "Installer quand même"
Sur la plupart des téléphones (Tecno, Infinix, Samsung) c'est 2 taps.

## Autres options de diffusion (sans carte)
- **GitHub Releases** : liens directs (déjà en place : `child-latest`, `parent-latest`).
- **APKPure / Uptodown** : hébergement APK gratuit.
- **WhatsApp / lien direct** : envoie l'APK signé directement.
