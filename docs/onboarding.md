# Onboarding : bien démarrer sur Elite Pack

Ce guide s’adresse à toute personne qui rejoint le projet : développeur, stagiaire ou relecteur. Il se suit dans l’ordre.

> **Objectif de la première journée** : l’application tourne sur ton poste, les tests passent, tu as ouvert un booster dans ton navigateur et tu sais quel ticket prendre.
> **Objectif de la deuxième séance** : ta première PR est ouverte.

## Sommaire

1. [Avant d’arriver : accès et outils](#1-avant-darriver--accès-et-outils)
2. [Jour 1 : installer et lancer le projet](#2-jour-1--installer-et-lancer-le-projet)
3. [Comprendre le projet en 30 minutes](#3-comprendre-le-projet-en-30-minutes)
4. [Glossaire](#4-glossaire)
5. [Où écrire quoi dans le code](#5-où-écrire-quoi-dans-le-code)
6. [Ta première contribution](#6-ta-première-contribution)
7. [Dépannage](#7-dépannage)
8. [Carnet de passation](#8-carnet-de-passation)

---

## 1. Avant d’arriver : accès et outils

| À obtenir | Auprès de | Pourquoi |
| --- | --- | --- |
| Accès collaborateur au [dépôt GitHub](https://github.com/kuro250104/elite-pack) | Propriétaire du dépôt (kuro250104) | Créer des branches et ouvrir des PR |
| Accès au [board Jira SCRUM](https://lemeurvincent31.atlassian.net/jira/software/projects/SCRUM/boards/1/backlog) | Chef de projet Jira | Prendre et suivre ses tickets |
| Un tuteur désigné | Équipe | Relire tes PR et répondre à tes questions |

| Outil | Version | Vérification |
| --- | --- | --- |
| Node.js | 22.12 ou plus (voir `.nvmrc`) | `node --version` |
| npm | fourni avec Node.js | `npm --version` |
| Docker Desktop, avec Compose | récent, **démarré** | `docker compose version` |
| Git | récent | `git --version` |
| Éditeur | VS Code conseillé, avec les extensions ESLint, Prisma et Tailwind CSS | — |

---

## 2. Jour 1 : installer et lancer le projet

Toutes les commandes se lancent à la racine du dépôt.

### Étape 1 : récupérer le code et les dépendances

```sh
git clone https://github.com/kuro250104/elite-pack.git
cd elite-pack
git switch dev
npm ci
```

`npm ci` installe exactement les versions de `package-lock.json` et génère le client Prisma.

### Étape 2 : configurer l’environnement

```sh
cp .env.example .env
```

Dans `.env` :

- remplacer `CHANGE_ME_LOCAL_PASSWORD` **aux deux endroits** (`POSTGRES_PASSWORD` et `DATABASE_URL`) par un mot de passe local ;
- renseigner `AUTH_SECRET` avec le résultat de `openssl rand -base64 32` ;
- laisser `THESPORTSDB_MODE="development"`, et `THESPORTSDB_API_KEY` vide sauf si on te confie une clé.

`.env` n’est jamais commité.

### Étape 3 : démarrer PostgreSQL et préparer la base

```sh
docker compose -p elite-pack-foundation up -d
npm run db:deploy
npm run db:seed
npm run db:seed-demo
```

`db:seed-demo` charge un catalogue jouable sans connexion réseau : deux sports, Kylian Mbappé et Lewis Hamilton (données TheSportsDB), et le booster **Découverte multisport** avec douze éditions. La commande refuse toute base qui n’est pas sur `localhost` et peut être relancée sans risque.

### Étape 4 : lancer l’application

```sh
npm run dev
```

Ouvrir <http://localhost:3000>, créer un compte sur **/inscription**, puis aller sur **/boosters**.

Récupère le booster de bienvenue et ouvre-le : les cartes apparaissent dans **/collection**. Pour les pages d’administration, demande à ton tuteur le rôle ADMIN (`npm run admin:grant-local`, voir [l’authentification](authentication.md)).

### Étape 5 : vérifier que tout est vert

```sh
npm run lint
npm run typecheck
npm test
```

Puis, avec la base locale démarrée :

```sh
npx playwright install chromium
TEST_DATABASE_URL="$DATABASE_URL" npm run test:integration
TEST_DATABASE_URL="$DATABASE_URL" npm run test:e2e
```

### Étape 6 : explorer les documentations vivantes

| Documentation | Commande ou adresse | Contenu |
| --- | --- | --- |
| API (Swagger UI) | <http://localhost:3000/api-docs> | Les routes, leurs entrées, leurs réponses et leurs erreurs, générées depuis les schémas Zod |
| Document OpenAPI brut | <http://localhost:3000/api/openapi> | Le même contenu en JSON, importable dans Postman |
| Composants (Ladle) | `npm run ladle`, puis <http://localhost:61000> | Cartes, raretés, panneau de boosters, formulaires, en 800x600, mobile et bureau |
| État du service | <http://localhost:3000/api/health> | 200 si l’application et PostgreSQL répondent, 503 sinon |

**Fin de la journée 1** : coche chaque étape dans la sous-tâche Jira d’onboarding de ton ticket et note tout point bloquant dans le carnet de passation.

---

## 3. Comprendre le projet en 30 minutes

Lis dans cet ordre :

1. [README](../README.md) : ce que fait le jeu et ce qui est livré.
2. [AGENTS.md](../AGENTS.md), sections 6 à 11 : les règles métier (athlète, édition, exemplaire, raretés, boosters).
3. [Personas](personas.md) : pour qui on construit.
4. [Story map](story-map.md) : le parcours du joueur et ce qui reste à faire.
5. [Architecture](architecture.md) et [base de données](database.md).
6. [GUIDELINES.md](../GUIDELINES.md) : conventions de code, de sécurité et de versionnage.

Trois règles à retenir dès le premier jour :

- **Le serveur décide de tout.** Le navigateur n’envoie jamais un solde, un résultat de tirage ou un stock : il demande, le serveur vérifie.
- **Tout ce qui touche à l’économie est transactionnel et idempotent.** Une même requête rejouée ne débite ni ne consomme deux fois.
- **L’interface est entièrement en français.** Les identifiants techniques restent en anglais.

---

## 4. Glossaire

| Terme | Définition |
| --- | --- |
| **Athlete** | Une personne réelle (ex. Kylian Mbappé). Ce n’est pas une carte. |
| **CardEdition** | Une édition collectionnable d’un athlète (Standard, Golden…), avec sa propre rareté et éventuellement un tirage limité. |
| **CardInstance** | Un exemplaire précis d’une édition, possédé par un seul joueur à la fois, parfois numéroté (`0042 / 0500`). |
| **Rareté** | Rareté de collection d’une édition : Commune, Peu commune, Rare, Épique, Légendaire, Mythique. |
| **Prestige** | Score sportif de l’athlète, de 0 à 100, calculé par sport. Indépendant de la rareté. |
| **Booster passif** | Booster gratuit générique : un toutes les 15 minutes, plafond de 10. Le sport est choisi à l’ouverture. |
| **Frappe (mint)** | Création d’un exemplaire lors d’une ouverture ; un tirage limité ne dépasse jamais son maximum. |
| **Revente à la banque** | Vente d’un exemplaire au jeu contre un pourcentage de sa valeur ; l’exemplaire est retiré de la circulation. |
| **Idempotence** | Garantie qu’une opération rejouée avec la même clé (`Idempotency-Key`) ne produit son effet qu’une fois. |
| **Points de base** | Probabilités exprimées sur 10 000 (5 500 = 55 %). |

---

## 5. Où écrire quoi dans le code

| Je dois… | Dossier | Exemple à suivre |
| --- | --- | --- |
| Ajouter une page | `src/app/(game)/…/page.tsx` | `src/app/(game)/collection/page.tsx` |
| Ajouter une route API | `src/app/api/…/route.ts` (fine : validation, droits, appel du service) | `src/app/api/me/cards/route.ts` |
| Écrire une règle métier | `src/server/<domaine>/` | `src/server/collection/service.ts` |
| Valider une entrée | Schéma Zod exporté par le service | `collectionQuerySchema` |
| Créer un composant | `src/components/<domaine>/` + une story `*.stories.tsx` | `src/components/cards/athlete-card.tsx` |
| Modifier la base | `prisma/schema.prisma` puis `npm run db:migrate` | `prisma/migrations/` |
| Tester une règle | `tests/unit/` (sans base) ou `tests/integration/` (PostgreSQL) | `tests/integration/collection.test.ts` |
| Tester un parcours | `tests/e2e/` (Playwright) | `tests/e2e/game-loop.spec.ts` |

Deux garde-fous automatiques :

- une nouvelle route API doit être ajoutée à `src/server/api-docs/openapi.ts`, sinon `npm test` échoue ;
- les erreurs d’API passent par `success()` et `failure()` de `src/lib/api/http.ts` : format `{ "error": { "code", "message" } }`, message en français, jamais de détail technique.

---

## 6. Ta première contribution

1. Choisis un ticket **À faire** étiqueté `stagiaire` ou `good-first-issue` dans Jira, assigne-le-toi et passe-le **En cours**.
2. Vérifie que le ticket est prêt : critères d’acceptation, sous-tâches Front et Back, points de départ.
3. Crée ta branche depuis `dev`, avec la clé Jira :

   ```sh
   git switch dev
   git pull --ff-only
   git switch -c feat/SCRUM-88-wishlist
   ```

4. Commits courts au format `feat(collection): ajouter la liste de souhaits`.
5. Avant de pousser : `npm run lint`, `npm run typecheck`, `npm test`, et les tests PostgreSQL ou E2E si ton ticket touche la base ou un parcours.
6. Ouvre une PR vers `dev` avec la clé Jira dans le titre (`[SCRUM-88] Liste de souhaits`), remplis le modèle de PR et demande la relecture de ton tuteur.
7. La CI doit être entièrement verte. Après fusion, passe le ticket **Terminé** une fois ses critères vérifiés.

Le détail des règles de branches et de revue est dans [CONTRIBUTING.md](../CONTRIBUTING.md) et [le workflow](workflow.md).

---

## 7. Dépannage

| Symptôme | Cause probable | Solution |
| --- | --- | --- |
| `Renseigner POSTGRES_PASSWORD dans .env` | `.env` absent ou incomplet | Refaire l’étape 2 |
| `DATABASE_URL doit être configurée.` | Variable absente | Vérifier `.env`, puis relancer `npm run dev` |
| `connect ECONNREFUSED 127.0.0.1:5432` ou `/api/health` en 503 | PostgreSQL arrêté | Démarrer Docker Desktop, puis `docker compose -p elite-pack-foundation up -d` |
| Port 5432 déjà utilisé | Un autre PostgreSQL tourne | Arrêter l’autre service ou changer le port dans `compose.yaml` et `DATABASE_URL` |
| Erreurs de types sur `@/generated/prisma` | Client Prisma non généré | `npm run db:generate` |
| Versions d’outils inattendues (Vitest, ESLint…) | `node_modules` désynchronisé du lockfile | `npm ci` |
| `Executable doesn't exist` avec Playwright | Navigateur non installé | `npx playwright install chromium` |
| Connexion impossible après inscription | `AUTH_SECRET` vide | Le renseigner, puis redémarrer `npm run dev` |
| Pas de lien Administration | Compte sans rôle ADMIN | Voir [l’authentification](authentication.md) |
| Aucun booster ouvrable | Catalogue vide | `npm run db:seed-demo` (après `db:seed`) |
| `MISSING_CONFIGURATION` ou `INVALID_PROBABILITIES` au chargement de la démo | `db:seed` non exécuté | `npm run db:seed`, puis `npm run db:seed-demo` |

Bloqué plus de 30 minutes ? Écris ce que tu as essayé dans le carnet de passation et préviens ton tuteur.

---

## 8. Carnet de passation

Chaque nouvel arrivant tient un carnet partagé avec son tuteur, **relu ensemble chaque fin de semaine**.

```markdown
## Semaine du JJ/MM

### Fait
- …

### Bloquant ou incompris
- …

### Questions ouvertes
- …

### Améliorations proposées pour ce guide
- …
```

Chaque amélioration retenue devient un ticket Jira : c’est ainsi que ce guide reste à jour.
