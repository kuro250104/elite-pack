# Contribuer à Elite Pack

Elite Pack est un TCG multisport gratuit, entièrement en français. La boucle de jeu (boosters, collection, banque, marché, administration) est livrée ; le travail en cours est listé dans la [story map](docs/story-map.md). Lire [AGENTS.md](AGENTS.md), [les conventions](GUIDELINES.md) et [l’architecture](docs/architecture.md) avant de commencer.

**Première contribution ?** Suivre d’abord le [guide d’onboarding](docs/onboarding.md) : accès, installation pas à pas, glossaire, dépannage et carnet de passation.

## Installer l’environnement

Prérequis : Node.js 22.12 ou supérieur, npm et Docker avec Compose. Les versions exactes des dépendances sont conservées dans `package-lock.json`.

```sh
npm ci
cp .env.example .env
# Renseigner le mot de passe PostgreSQL local et AUTH_SECRET. OAuth est facultatif.
docker compose -p elite-pack-foundation up -d
npm run db:deploy
npm run db:seed
npm run db:seed-demo
npm run dev
```

Générer `AUTH_SECRET` avec `openssl rand -base64 32`. La connexion locale par e-mail et mot de passe ne nécessite pas GitHub. Pour activer l’option GitHub, déclarer dans l’application OAuth le callback `http://localhost:3000/api/auth/callback/github`. Renseigner `THESPORTSDB_API_KEY` pour les imports réels. Ne pas committer `.env` ni les secrets. Les identifiants PostgreSQL de `.env.example` servent exclusivement au développement local. Le seed ne crée pas d’administrateur ; le rôle doit être attribué par un opérateur de confiance.

Les commandes reproductibles et limites de l’authentification sont détaillées dans [README.md](README.md). Les tests PostgreSQL nécessitent une base de test migrée et `TEST_DATABASE_URL` explicite.

## Prendre un ticket

Choisir un ticket **À faire** dans le [board Jira SCRUM](https://lemeurvincent31.atlassian.net/jira/software/projects/SCRUM/boards/1/backlog), s’assigner et le passer **En cours**. Vérifier son EPIC parent, ses critères d’acceptation, ses sous-tâches Front et Back, ses dépendances et son estimation avant de modifier le code. Le [workflow](docs/workflow.md) définit les critères de passage (DoR/DoD). Les tickets EP01 à EP04 du GitHub Project nº 4 conservent l’historique du POC.

## Créer une branche et une PR

Le projet utilise deux branches permanentes protégées : `main` (version stable et livrable) et `dev` (intégration et tests). Chaque changement utilise une branche courte issue de `dev`. Le détail des règles figure dans [le workflow](docs/workflow.md#branches-et-protections).

```sh
git switch dev
git pull --ff-only
git switch -c feat/SCRUM-88-wishlist
```

Préfixes : `feat/`, `fix/`, `docs/`, `test/` ou `chore/`. La clé Jira (`SCRUM-88`) relie la branche, la PR et le ticket ; la reprendre dans le titre de la PR (`[SCRUM-88] Liste de souhaits`). Utiliser un slug lisible en anglais, en minuscules avec tirets. Ouvrir une PR vers `dev`. Seules `dev` (PR de promotion) et `hotfix/*` peuvent ouvrir une PR vers `main`.

Une PR explique le problème, le résultat, les vérifications réellement exécutées et les risques. Ajouter une capture pour une modification visuelle et détailler toute migration. Le numéro GitHub doit être remplacé par celui de l’issue réelle, jamais laissé en exemple.

## Vérifier avant la revue

```sh
npm run lint
npm run typecheck
npm test
npm run db:validate
npm run build
```

Pour un changement PostgreSQL ou métier transactionnel :

```sh
TEST_DATABASE_URL="$DATABASE_URL" npm run test:integration
```

Pour un parcours utilisateur, installer Chromium avec `npx playwright install chromium`, puis exécuter `npm run test:e2e` avec une base de test configurée si le scénario l’exige. Une absence de prérequis doit être signalée ; elle ne signifie pas que les tests passent.

Relire les migrations SQL, conserver les CHECK et index personnalisés. Ne jamais réinitialiser une base partagée ou de production. Ajouter des tests pour les invariants critiques, avec tests réels PostgreSQL et concurrence quand pertinent.

## Tenir la documentation à jour

- **Nouvelle route API** : l’ajouter à `src/server/api-docs/openapi.ts` avec son schéma Zod. Sinon, le test `tests/unit/openapi.test.ts` échoue. Vérifier le rendu sur `/api-docs`.
- **Nouveau composant ou nouvel état visuel** : ajouter une story `*.stories.tsx` à côté du composant et vérifier le rendu avec `npm run ladle`, notamment en 800x600 et sur mobile.
- **Nouvelle variable d’environnement** : la documenter dans `.env.example`, et dans `compose.yaml` si l’application conteneurisée en a besoin.

## Finaliser

Passer le ticket **En cours de revue** lorsque la PR est prête et que les vérifications requises passent. Fusionner dans `dev` (squash) après revue et contrôles obligatoires. Le ticket passe **Terminé** lorsque ses critères d’acceptation sont vérifiés et sa PR fusionnée dans `dev`. Supprimer la branche courte une fois fusionnée.

Utiliser des commits tels que `feat(imports): preserve administrator overrides`, `fix(auth): reject unauthorized role updates` ou `docs(workflow): document review requirements`. Les textes de l’application et la documentation destinée à l’équipe restent en français.
