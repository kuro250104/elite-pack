# Historique des versions

## Non publié — 0.1.0

### Ajouts

- Socle Next.js, Prisma/PostgreSQL, Auth.js, composants shadcn/ui et interface française.
- Modèles distincts athlètes, éditions et exemplaires, contraintes SQL et configuration initiale.
- Imports administratifs TheSportsDB, déduplication, corrections prioritaires, quotas et audit.
- Documentation du TD POC, quatre EPICs frontend/backend, stratégie GitHub Flow et conventions SemVer.
- Configuration locale des workflows CI, triage d’issues et Dependabot.
- Boosters gratuits passifs : un booster toutes les 15 minutes, plafond de 10, calcul paresseux côté serveur et API `GET /api/boosters/passive`.
- Frappe transactionnelle d’exemplaires : doublons autorisés, propriétaire unique, tirages limités numérotés et protégés en concurrence.
- Branche d’intégration `dev`, contrôle d’origine des PR vers `main` et protections par rulesets de `main`, `dev` et des tags `v*`.

### Migrations

- `20261009130000_foundation` : schéma initial et invariants SQL.
- `20261009153000_import_security` : quotas partagés et traçabilité/idempotence des imports.

Aucune release, tag ou exécution GitHub Actions distante n’est encore revendiquée.
