# Historique des versions

## Non publié — 0.1.0

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
- Documentation de l’API : document OpenAPI 3.1 généré depuis les schémas Zod (`/api/openapi`), Swagger UI (`/api-docs`), masqués en production sauf `API_DOCS_ENABLED=true` ; un test vérifie que chaque route est documentée.
- Documentation des composants avec Ladle 5.1.1 (`npm run ladle`) : cartes et raretés, collection, panneau des boosters, design system, en largeurs 800x600, mobile et bureau. Ladle embarque son propre Vite 6 ; un `override` maintient Vite 8 pour Vitest.
- Sonde `GET /api/health` : 200 si l’application et PostgreSQL répondent, 503 sans détail technique sinon.
- Image Docker multi-étapes (migration et serveur standalone non root) et profil Compose `app` : dépendances `depends_on` sur l’état sain, sondes et limites de ressources.
- CI découpée en jobs orchestrés par `needs`, avec limites de durée, build Ladle et vérification de l’image Docker.
- Guide d’onboarding, personas, story map et import Jira des stories de la Road to MVP.

### Migrations

- `20261009130000_foundation` : schéma initial et invariants SQL.
- `20261009153000_import_security` : quotas partagés et traçabilité/idempotence des imports.

Aucune release, tag ou exécution GitHub Actions distante n’est encore revendiquée.
