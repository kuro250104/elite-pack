# Elite Pack — TCG multisport

[Dépôt GitHub](https://github.com/kuro250104/elite-pack) · [Board Jira SCRUM](https://lemeurvincent31.atlassian.net/jira/software/projects/SCRUM/boards/1/backlog) · [GitHub Project du POC](https://github.com/users/kuro250104/projects/4) · [Actions CI](https://github.com/kuro250104/elite-pack/actions)

Elite Pack est un jeu de cartes à collectionner multisport, gratuit et entièrement en français. Les joueurs reçoivent un booster gratuit toutes les 15 minutes, choisissent le sport à l’ouverture et collectionnent plusieurs éditions d’athlètes réels. Tirages, stocks, soldes et échanges sont décidés uniquement par le serveur.

> **Nouvel arrivant ?** Commence par le [guide d’onboarding](docs/onboarding.md) : installation pas à pas, glossaire, premier ticket et dépannage.

## Fonctionnalités livrées

| Domaine | Ce que le joueur ou l’administrateur peut faire | Story Jira |
| --- | --- | --- |
| Compte | S’inscrire et se connecter par e-mail et mot de passe ; consulter son profil et son solde | SCRUM-26, SCRUM-27 |
| Boosters | Recevoir un booster gratuit toutes les 15 minutes (plafond 10, même hors ligne), choisir le sport, ouvrir 5 cartes par tirage cryptographique côté serveur, retrouver l’historique | SCRUM-28, SCRUM-30, SCRUM-35 à 37 |
| Événements | Acheter ou récupérer des boosters événementiels pendant leur période | SCRUM-40 |
| Collection | Parcourir ses cartes (filtres, tris, doublons, cartes manquantes, progression par sport), l’encyclopédie et la page des sports | SCRUM-29, SCRUM-31, SCRUM-32, SCRUM-38 |
| Économie | Revendre une carte à la banque ; vendre et acheter entre joueurs sans double achat ni solde négatif | SCRUM-33, SCRUM-34 |
| Administration | Importer et synchroniser les athlètes TheSportsDB, valider les droits des images, gérer éditions, événements, probabilités et règles économiques, suivre les indicateurs | SCRUM-23 à 25, SCRUM-41 à 43 |

Le parcours complet du joueur et ce qui reste à faire sont visibles sur la [story map](docs/story-map.md). Les besoins viennent des [personas](docs/personas.md).

## Démarrage rapide

Prérequis : Node.js 22.12+, npm et Docker Desktop démarré.

```sh
npm ci
cp .env.example .env
# Remplacer CHANGE_ME_LOCAL_PASSWORD dans POSTGRES_PASSWORD et DATABASE_URL.
# Renseigner AUTH_SECRET (openssl rand -base64 32).
docker compose -p elite-pack-foundation up -d
npm run db:deploy
npm run db:seed
npm run dev
```

L’application répond sur <http://localhost:3000>. Pour obtenir un catalogue jouable (rôle ADMIN, import d’athlètes, booster de démonstration), suivre l’[onboarding](docs/onboarding.md#étape-4--lancer-lapplication).

### Pile complète en conteneurs

```sh
docker compose -p elite-pack-foundation --profile app up -d --build
```

Compose démarre PostgreSQL, attend qu’il soit sain, applique les migrations dans un conteneur dédié qui s’arrête ensuite, puis lance l’application. Celle-ci est sondée sur `/api/health`, et chaque service a des limites de CPU et de mémoire. Le [Dockerfile](Dockerfile) produit une image Node minimale (sortie Next.js « standalone »), exécutée sans droits root.

## Documentation

| Sujet | Où |
| --- | --- |
| API REST (Swagger UI, générée depuis les schémas Zod) | <http://localhost:3000/api-docs> en développement · JSON sur `/api/openapi` |
| Composants et design system (Ladle) | `npm run ladle` · [système de design](docs/design-system.md) |
| Personas et story map | [personas](docs/personas.md) · [story map](docs/story-map.md) |
| Architecture et base de données | [architecture](docs/architecture.md) · [base](docs/database.md) |
| Authentification et rôle ADMIN | [authentification](docs/authentication.md) |
| Imports TheSportsDB et droits des images | [imports](docs/imports.md) · [droits des images](docs/images-rights.md) |
| CI, orchestration et automatisations | [automatisations](docs/automations.md) |
| Contribution, conventions, workflow | [CONTRIBUTING](CONTRIBUTING.md) · [GUIDELINES](GUIDELINES.md) · [workflow](docs/workflow.md) |

La documentation de l’API est servie en développement et masquée en production, sauf si `API_DOCS_ENABLED=true`.

## Vérifications

```sh
npm run lint
npm run typecheck
npm test                      # unitaires, dont la synchronisation de la doc OpenAPI
npm run db:validate
npm run build
npm run ladle:build           # documentation des composants
npx playwright install chromium
TEST_DATABASE_URL="$DATABASE_URL" npm run test:integration   # base locale migrée et dédiée aux tests
TEST_DATABASE_URL="$DATABASE_URL" npm run test:e2e
```

La CI GitHub Actions exécute ces étapes dans des jobs enchaînés (qualité, puis tests, compilation, documentation et image Docker), décrits dans les [automatisations](docs/automations.md).

`npm run db:migrate` crée une migration en développement ; `npm run db:deploy` applique uniquement les migrations existantes. Ne jamais réinitialiser une base partagée ou de production.

## Architecture

- `src/app` : pages françaises (espace joueur, administration) et Route Handlers de `src/app/api`, volontairement fins.
- `src/server` : services métier transactionnels (boosters, cartes, collection, économie, marché, imports, administration).
- `src/providers` : client TheSportsDB validé par Zod, avec quota partagé en base.
- `src/components` : composants d’interface et leurs stories Ladle (`*.stories.tsx`).
- `src/lib` : authentification Auth.js, accès Prisma, format des réponses et des erreurs d’API.
- `prisma` : schéma, migrations et seed non destructif.
- `tests` : unitaires (Vitest), PostgreSQL réels (concurrence, transactions) et parcours navigateur (Playwright).

## Limites actuelles

- **Gestion des erreurs** : le format d’erreur est unifié et sans détail technique, mais il n’existe pas encore de journalisation structurée ni de mode verbeux de développement ([SCRUM-87](https://lemeurvincent31.atlassian.net/browse/SCRUM-87)).
- **Déploiement** : aucun déploiement automatique n’est configuré ; l’image Docker est construite et vérifiée en CI, mais n’est pas publiée.
- **Ouverture** : la révélation des cartes est simple ; l’animation progressive par rareté reste à faire (SCRUM-28).
- **Données** : seule TheSportsDB est utilisée (décision d’équipe du 17/11/2026) ; la clé gratuite limite le palmarès à 5 titres par athlète. Les images restent masquées tant que leurs droits ne sont pas validés dans `/admin/images`.
- **Connexion GitHub** : facultative, elle nécessite ses propres identifiants OAuth.
- **Auth.js** : version `5.0.0-beta.32`, à revalider avant une mise en production.

## Travailler en équipe

Le suivi se fait dans le [board Jira SCRUM](https://lemeurvincent31.atlassian.net/jira/software/projects/SCRUM/boards/1/backlog) ; le GitHub Project nº 4 conserve l’historique du POC. Les branches partent de `dev` et y reviennent par PR ; `dev` est promue vers `main` par PR, les deux étant protégées. Les versions suivent SemVer à partir de `0.1.0`.

Lire [CONTRIBUTING.md](CONTRIBUTING.md) pour les branches et les PR, [GUIDELINES.md](GUIDELINES.md) pour les conventions, et [le workflow](docs/workflow.md) pour les statuts et critères DoR/DoD.
