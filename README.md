# KidsGuard

Application de sécurité familiale — géolocalisation, géofencing et SOS pour
suivre la position d'un enfant. Inspiré de Findmykids. **Nom provisoire.**

Monorepo : deux apps Expo (parent + enfant) sur un backend Supabase commun.

## Structure

```
apps/
  parent/      Expo — dashboard parent (carte, zones, alertes)
  child/       Expo — agent enfant (envoi GPS, SOS, sonnerie)
packages/
  shared/      types, schémas Zod, client Supabase
  ui/          composants RN partagés
supabase/
  migrations/  schéma PostGIS + RLS + RPC
docs/          architecture & specs
```

## Prérequis

- Node ≥ 20, **pnpm 9** (`corepack enable`)
- Supabase CLI (`supabase`)
- Expo : `npx expo` (Dev Client requis pour modules natifs — pas Expo Go)

## Démarrage (Phase 0)

```bash
pnpm install
cp .env.example .env            # remplir URL + anon key

# Base de données
supabase init                   # si pas déjà fait
supabase start                  # Postgres local (Docker)
supabase db reset               # applique migrations/
pnpm db:types                   # génère les types TS depuis le schéma
```

## Sécurité — modèle d'acteurs

- **Parent** : compte Supabase classique. Possède familles + enfants.
- **Enfant** : session **anonyme** Supabase, liée à UNE ligne `children` au
  pairing (code 6 chiffres). Aucun mot de passe côté enfant.

RLS verrouille tout : un parent ne voit que ses enfants, un device enfant
n'écrit que SA position. Voir `supabase/migrations/0002_rls_and_rpc.sql`.

## Légal ⚠️

Données d'enfant = sensibles (RGPD). Écran de consentement obligatoire.
Pas d'écoute micro / enregistrement audio au MVP (bannissement stores +
illégal sans cadre de consentement). Positionner comme « sécurité familiale »
et non surveillance pour éviter le flag *stalkerware* (Play Store / App Store).

## Roadmap

| Phase | Contenu |
|------|---------|
| 0 ✅ | Monorepo + schéma Supabase + RLS |
| 1   | Géoloc fond enfant → carte temps réel parent |
| 2   | Géofencing (zones + alertes enter/exit) |
| 3   | SOS + sonnerie à distance |
| 4   | Temps d'écran (module natif Android puis iOS FamilyControls) |
