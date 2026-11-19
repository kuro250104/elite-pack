# Onboarding : bien démarrer sur Elite Pack

Ce guide s’adresse à toute personne qui rejoint le projet : développeur, stagiaire ou relecteur. Il se suit dans l’ordre et il est corrigé après chaque stage ([ce qui a changé](#11-ce-que-les-stages-précédents-ont-changé)).

> **Objectif de la première heure** : l’application tourne sur ton poste et tu sais distinguer athlète, édition et exemplaire.
> **Objectif de la première demi-journée** : tu as commité du code sur ton ticket, avec ton propre compte.
> **Objectif de la journée** : ton ticket est fusionné, et ton carnet de passation permet à quelqu’un d’autre de reprendre ton travail.

## Sommaire

1. [La méthode : comment on travaille ici](#1-la-méthode--comment-on-travaille-ici)
2. [Avant d’arriver : accès et outils](#2-avant-darriver--accès-et-outils)
3. [Jour 1 : installer et lancer le projet](#3-jour-1--installer-et-lancer-le-projet)
4. [Comprendre le projet en 30 minutes](#4-comprendre-le-projet-en-30-minutes)
5. [Glossaire](#5-glossaire)
6. [Où écrire quoi dans le code](#6-où-écrire-quoi-dans-le-code)
7. [Ta première contribution](#7-ta-première-contribution)
8. [Stage d’une journée : déroulé](#8-stage-dune-journée--déroulé)
9. [Dépannage](#9-dépannage)
10. [Carnet de passation](#10-carnet-de-passation)
11. [Ce que les stages précédents ont changé](#11-ce-que-les-stages-précédents-ont-changé)

---

## 1. La méthode : comment on travaille ici

**Les règles avant le code.** Lis les règles du projet ([AGENTS.md](../AGENTS.md), sections 6 à 11) avant d’ouvrir un fichier de code. La distinction la plus importante : un **athlète** (la personne réelle) n’est pas une **édition** (la carte collectionnable), qui n’est pas un **exemplaire** (la copie possédée par un joueur). Voir le [glossaire](#5-glossaire).

**Quatre questions avant chaque tâche**, à noter dans le carnet de passation :

| Question | Où trouver la réponse |
| --- | --- |
| 1. **Quel ticket ?** Quelle clé Jira, quels critères d’acceptation ? | Le ticket et ses sous-tâches dans Jira |
| 2. **Où se trouve la logique métier ?** | Dans `src/server/<domaine>/`, jamais dans un composant ni dans une route API ([où écrire quoi](#6-où-écrire-quoi-dans-le-code)) |
| 3. **Qu’est-ce qui peut casser ?** | Soldes, stocks, propriété d’une carte, droits, concurrence, migration de données |
| 4. **Comment je le teste ?** | Unitaire (`tests/unit`), PostgreSQL (`tests/integration`) ou parcours (`tests/e2e`) |

**Reformuler.** Quand le tuteur explique ou montre quelque chose, reformule-le en une phrase dans le carnet. Si tu n’y arrives pas, c’est le moment de poser la question.

**Coder tôt.** Le nouvel arrivant tient le clavier dès la première demi-journée, même pour une petite partie du ticket. Le tuteur pose les questions et ne reprend le clavier que pour débloquer.

**Le carnet de passation** est le premier document à ouvrir pour reprendre le projet : on le tient au fil de l’eau et on le relit ensemble à chaque point d’étape ([modèle](carnet-de-passation.md)).

---

## 2. Avant d’arriver : accès et outils

| À obtenir | Auprès de | Pourquoi |
| --- | --- | --- |
| Accès collaborateur au [dépôt GitHub](https://github.com/kuro250104/elite-pack) | Propriétaire du dépôt (kuro250104) | Créer des branches et ouvrir des PR |
| Accès au [board Jira SCRUM](https://lemeurvincent31.atlassian.net/jira/software/projects/SCRUM/boards/1/backlog) | Chef de projet Jira | Prendre et suivre ses tickets |
| Un tuteur désigné | Équipe | Relire tes PR, poser les questions, tenir le carnet avec toi |
| Ton propre compte GitHub, configuré dans Git (`git config user.name` et `user.email`) | Toi | Ton travail est suivi par tes commits : ne jamais commiter avec le compte du tuteur |

| Outil | Version | Vérification |
| --- | --- | --- |
| Node.js | 22.12 ou plus (voir `.nvmrc`) | `node --version` |
| npm | fourni avec Node.js | `npm --version` |
| Docker Desktop, avec Compose | récent, **démarré** | `docker compose version` |
| Git | récent | `git --version` |
| Éditeur | VS Code conseillé, avec les extensions ESLint, Prisma et Tailwind CSS | — |

---

## 3. Jour 1 : installer et lancer le projet

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

## 4. Comprendre le projet en 30 minutes

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

## 5. Glossaire

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

## 6. Où écrire quoi dans le code

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

## 7. Ta première contribution

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
7. La CI doit être entièrement verte. Après fusion dans `dev`, le tuteur ouvre la PR de promotion `dev` → `main` : le travail du stagiaire arrive sur la branche principale le jour même.
8. Passe le ticket **Terminé** une fois ses critères vérifiés, et complète le carnet.

Le détail des règles de branches et de revue est dans [CONTRIBUTING.md](../CONTRIBUTING.md) et [le workflow](workflow.md).

---

## 8. Stage d’une journée : déroulé

Pour un stage de 11 h à 17 h sur un ticket fullstack (par exemple [SCRUM-88](https://lemeurvincent31.atlassian.net/browse/SCRUM-88), la liste de souhaits). **Le ticket doit être fusionné le jour même** : si le temps manque, le tuteur termine sur la même branche, et le stagiaire garde ses commits.

| Heure | Stagiaire (au clavier) | Tuteur | Point de contrôle |
| --- | --- | --- | --- |
| 11 h 00 | Accès, clone, `npm ci`, `.env`, base, `npm run dev` | Vérifie les accès GitHub et Jira, ouvre le carnet | L’application tourne |
| 11 h 30 | Lit la méthode et le glossaire, répond aux quatre questions pour son ticket | Fait reformuler athlète, édition, exemplaire | Carnet : quatre réponses écrites |
| 11 h 45 | Branche `feat/SCRUM-88-…`, modèle Prisma et migration | Pose les questions, notamment « qu’est-ce qui peut casser ? » | **Premier commit poussé** |
| 12 h 30 | Pause | | |
| 13 h 30 | Service et routes API, validation Zod, tests PostgreSQL | Relit au fil de l’eau | Tests back verts |
| 14 h 45 | Point carnet (10 min) | Relit le carnet avec le stagiaire | Blocages notés, portée ajustée si besoin |
| 15 h 00 | Interface (bouton, onglet), composants du design system | Vérifie les états erreur et vide | Parcours manuel réussi |
| 16 h 00 | Test Playwright, `lint`, `typecheck`, PR vers `dev` | Revue de la PR | CI verte |
| 16 h 40 | Corrections de revue | Fusion dans `dev`, puis promotion `dev` → `main` | **Travail sur `main`** |
| 16 h 50 | Bilan dans le carnet | Bilan tuteur, tickets d’amélioration | Rapports joints au ticket Jira |

Si la portée ne tient pas dans la journée, on retire d’abord les éléments marqués *bonus* dans le ticket, jamais les tests.

---

## 9. Dépannage

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

## 10. Carnet de passation

Chaque nouvel arrivant tient un carnet partagé avec son tuteur, à partir du [modèle](carnet-de-passation.md). On le remplit au fil de l’eau et on le relit ensemble **à chaque point d’étape** : au milieu de la journée pour un stage court, chaque fin de semaine pour une arrivée plus longue.

Il contient, pour chaque tâche, les réponses aux [quatre questions](#1-la-méthode--comment-on-travaille-ici), les reformulations, les blocages et les décisions. C’est le document à transmettre à la personne suivante. Chaque amélioration retenue devient un ticket Jira : c’est ainsi que ce guide reste à jour.

---

## 11. Ce que les stages précédents ont changé

| Retour du stage | Changement dans ce guide |
| --- | --- |
| Lire les règles du projet avant le code a été la clé | La méthode passe en tête du guide (section 1) |
| Se poser les mêmes questions à chaque tâche structure le travail | Les quatre questions, notées dans le carnet pour chaque tâche |
| Reformuler montre ce qui n’a pas été compris | Reformulation systématique dans le carnet |
| Passer plus tôt au rôle de celui qui code | Premier commit attendu dès la première demi-journée ; le tuteur questionne au lieu de coder ([SCRUM-92](https://lemeurvincent31.atlassian.net/browse/SCRUM-92)) |
| Faire régulièrement le point sur le carnet | Points carnet planifiés dans le déroulé, et modèle de carnet ([SCRUM-93](https://lemeurvincent31.atlassian.net/browse/SCRUM-93)) |
| Le carnet est le premier document pour reprendre le projet | Le carnet devient un livrable de fin de stage, au même titre que la PR |
