# Historique des versions

## 0.2.0 — 2026-11-19

### Ajouts

- Gestion des erreurs (SCRUM-87) : identifiant `requestId` dans chaque erreur d’API (corps et en-tête `X-Request-Id`) ; erreurs Prisma et PostgreSQL traduites en 404, 409 ou 503 ; détail `debug` en développement uniquement ; journalisation structurée sans dépendance (JSON en production, `LOG_LEVEL`, secrets masqués) ; `onRequestError` pour les plantages de rendu ; `global-error.tsx` ; référence affichée au joueur pour les erreurs serveur ; page de démonstration `/demo/erreurs` ; documentation `docs/errors.md`.
- Livraison et déploiement continus : publication des images sur GHCR après chaque CI réussie sur `main` ; déploiement facultatif sur un serveur Docker (Caddy HTTPS, application, PostgreSQL) avec migrations, contrôle `/api/health` et retour arrière automatique ; procédure dans `docs/deploiement.md`.
- Données de démonstration hors ligne (`npm run db:seed-demo`) : deux sports, deux athlètes TheSportsDB rejoués par les services d’import et booster Découverte multisport, en une commande idempotente réservée aux bases locales ; `game:prepare` partage désormais le même service.
- Documentation de l’API : document OpenAPI 3.1 généré depuis les schémas Zod (`/api/openapi`), Swagger UI (`/api-docs`), masqués en production sauf `API_DOCS_ENABLED=true` ; un test vérifie que chaque route est documentée.
- Documentation des composants avec Ladle 5.1.1 (`npm run ladle`) : cartes et raretés, collection, panneau des boosters, design system, en largeurs 800x600, mobile et bureau. Ladle embarque son propre Vite 6 ; un `override` maintient Vite 8 pour Vitest.
- Sonde `GET /api/health` : 200 si l’application et PostgreSQL répondent, 503 sans détail technique sinon.
- Image Docker multi-étapes (migration et serveur standalone non root) et profil Compose `app` : dépendances `depends_on` sur l’état sain, sondes et limites de ressources.
- CI découpée en jobs orchestrés par `needs`, avec limites de durée, build Ladle et vérification de l’image Docker.
- Guide d’onboarding, personas, story map et import Jira des stories de la Road to MVP.

### Migrations

- Aucune.

## 0.1.0 — 2026-11-17

### Ajouts

- Socle Next.js, Prisma/PostgreSQL, Auth.js, composants shadcn/ui et interface française.
- Modèles distincts athlètes, éditions et exemplaires, contraintes SQL et configuration initiale.
- Imports administratifs TheSportsDB, déduplication, corrections prioritaires, quotas et audit.
- Documentation du TD POC, quatre EPICs frontend/backend, stratégie GitHub Flow et conventions SemVer.
- Configuration locale des workflows CI, triage d’issues et Dependabot.
- Interface des boosters : stock gratuit, plafond, décompte indicatif, choix du sport, booster de bienvenue, révélation des cartes et tableau de bord du joueur.
- Ouverture sécurisée des boosters : probabilités lues en base, tirage cryptographique, pools vérifiés, idempotence, booster de bienvenue unique et script `game:prepare` du catalogue de démonstration.
- Boosters gratuits passifs : un booster toutes les 15 minutes, plafond de 10, calcul paresseux côté serveur et API `GET /api/boosters/passive`.
- Frappe transactionnelle d’exemplaires : doublons autorisés, propriétaire unique, tirages limités numérotés et protégés en concurrence.
- Branche d’intégration `dev`, contrôle d’origine des PR vers `main` et protections par rulesets de `main`, `dev` et des tags `v*`.
- Inscription : erreurs par champ en français, e-mail déjà utilisé signalé, connexion automatique ; formulaires désactivés avant l’hydratation (aucun mot de passe dans l’URL).
- Collection : filtres pays et équipe, tris par prestige et valeur, cartes manquantes verrouillées avant découverte, progression par sport.
- Profil joueur et `GET /api/me` : solde dans la navigation, statistiques de collection et de boosters.
- Encyclopédie des athlètes : fiches débloquées par la découverte d’une carte, éditions possédées et manquantes, tri alphabétique français.
- Prestige calculé à partir du palmarès TheSportsDB (`lookuphonours.php`), en rang centile au sein de chaque sport ; surcharge administrateur préservée.
- Économie : valeur des éditions par rareté (`RarityValue`) et prestige, revente à la banque idempotente, refus d’un rachat à 0.
- Marché entre joueurs : mise en vente, retrait, achat atomique et idempotent, historique ; solde de départ de 500 pièces.
- Administration : tableau de bord, règles économiques et probabilités des boosters avec historique, gestion des éditions, boosters événementiels, synchronisation des athlètes, don de boosters à tous les joueurs.
- Historique des ouvertures filtrable par sport et par date.
- Boosters événementiels : achat ou récupération pendant l’événement, limite par joueur, ouverture possible après la fin.
- Page des sports avec compteurs et progression.
- Synchronisation périodique des athlètes par lots, dans le respect du quota TheSportsDB, avec historique des champs modifiés ; tâche planifiée Vercel facultative.

### Corrections

- Palmarès réellement récupéré à l’import (attente du créneau du quota partagé).
- Éléments sous les cartes de la collection qui chevauchaient la rangée suivante.
- Tests navigateur exécutés un par un (base partagée).

### Sécurité

- Next.js 16.4.6, correctif d’un avis de sécurité.
- `next-env.d.ts` n’est plus versionné.

### Migrations

- `20261009130000_foundation` : schéma initial et invariants SQL.
- `20261009153000_import_security` : quotas partagés et traçabilité/idempotence des imports.
- `20261012130000_image_review` : revue des droits des images.
- `20261012150000_credentials_auth` : comptes e-mail et mot de passe.
- `20261117100000_rarity_values` : valeur de base par rareté.
- `20261117100500_backfill_edition_values` : valorisation des éditions restées à 0.
- `20261117110000_starting_balance` : solde de départ de 500 pièces (configuration non modifiée si déjà réglée).
- `20261117120000_event_booster_limit` : limite d’achats par joueur des boosters événementiels.

Toutes les migrations sont additives ; aucune donnée existante n’est supprimée.

