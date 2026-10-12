# Contribuer à Elite Pack

Elite Pack est un TCG multisport gratuit, entièrement en français. Le travail actuel porte sur le socle et les imports administratifs ; les ouvertures, la frappe et le marché ne sont pas encore implémentés. Lire [AGENTS.md](AGENTS.md), [les conventions](GUIDELINES.md) et [l’architecture](docs/architecture.md) avant de commencer.

## Installer l’environnement

Prérequis : Node.js 22.12 ou supérieur, npm et Docker avec Compose. Les versions exactes des dépendances sont conservées dans `package-lock.json`.

```sh
npm ci
cp .env.example .env
# Renseigner le mot de passe PostgreSQL local et AUTH_SECRET. OAuth est facultatif.
docker compose -p elite-pack-foundation up -d
npm run db:deploy
npm run db:seed
npm run dev
```

Générer `AUTH_SECRET` avec `openssl rand -base64 32`. La connexion locale par e-mail et mot de passe ne nécessite pas GitHub. Pour activer l’option GitHub, déclarer dans l’application OAuth le callback `http://localhost:3000/api/auth/callback/github`. Renseigner `THESPORTSDB_API_KEY` pour les imports réels. Ne pas committer `.env` ni les secrets. Les identifiants PostgreSQL de `.env.example` servent exclusivement au développement local. Le seed ne crée pas d’administrateur ; le rôle doit être attribué par un opérateur de confiance.

Les commandes reproductibles et limites de l’authentification sont détaillées dans [README.md](README.md). Les tests PostgreSQL nécessitent une base de test migrée et `TEST_DATABASE_URL` explicite.

## Prendre un ticket

Choisir un ticket `Ready` dans le projet GitHub, s’assigner et passer son statut à `In Progress`. Vérifier son EPIC parent, ses critères d’acceptation, ses dépendances et son estimation avant de modifier le code. Chaque EPIC doit avoir au moins un ticket frontend et un ticket backend. Le [workflow](docs/workflow.md) définit les champs et les critères de passage.

La cible GitHub du projet doit être configurée avant ce parcours. Tant que le dépôt distant et le board ne sont pas créés, les fichiers locaux de préparation constituent un plan ; ils ne remplacent pas un outil de suivi utilisable.

## Créer une branche et une PR

Le projet utilise deux branches permanentes protégées : `main` (version stable et livrable) et `dev` (intégration et tests). Chaque changement utilise une branche courte issue de `dev`. Le détail des règles figure dans [le workflow](docs/workflow.md#branches-et-protections).

```sh
git switch dev
git pull --ff-only
git switch -c feat/EP02-02-import-athlete
```

Préfixes : `feat/`, `fix/`, `docs/`, `test/` ou `chore/`. Le code `EP02-02` est l’identifiant stable du ticket ; l’issue GitHub garde son propre numéro. Utiliser un slug lisible en anglais, en minuscules avec tirets. Ouvrir une PR vers `dev` et lier l’issue avec `Closes #123`. Associer aussi la PR au board. Seules `dev` (PR de promotion) et `hotfix/*` peuvent ouvrir une PR vers `main`.

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

## Finaliser

Passer le ticket à `Review` lorsque la PR est prête et que les vérifications requises passent. Fusionner dans `dev` (squash) après revue et contrôles obligatoires. Le ticket passe à `Done` lorsque ses critères d’acceptation sont vérifiés et sa PR fusionnée dans `dev`. Supprimer la branche courte une fois fusionnée.

Utiliser des commits tels que `feat(imports): preserve administrator overrides`, `fix(auth): reject unauthorized role updates` ou `docs(workflow): document review requirements`. Les textes de l’application et la documentation destinée à l’équipe restent en français.
