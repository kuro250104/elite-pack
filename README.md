# Elite Pack — TCG multisport

[Dépôt GitHub](https://github.com/kuro250104/elite-pack) · GitHub Projects : lien à renseigner après création et vérification.

Elite Pack est un jeu de cartes à collectionner multisport, gratuit et entièrement en français. Sa fonctionnalité principale visée est l’ouverture de boosters gratuits avec choix du sport, afin de collectionner plusieurs éditions d’athlètes réels. Les résultats, stocks et échanges seront garantis par le serveur.

Ce **POC** prépare le travail d’équipe et le socle technique. Les comptes, sessions, modèles PostgreSQL et imports administratifs sont implémentés; l’ouverture, la frappe et le marché restent au backlog. Avant d’élargir le MVP, valider la documentation, le suivi hiérarchique, le board et les automatisations demandés par le TD.

La conformité au sujet est suivie dans [la matrice du POC](docs/poc-conformite.md). Les [quatre EPICs et seize sous-tâches](docs/backlog.md) sont préparés pour GitHub Projects. Un fichier de préparation ne constitue pas un board distant déjà opérationnel.

Socle Next.js App Router entièrement en français. Cette étape prépare les modèles, l’authentification et les frontières des services. Les imports administratifs sont disponibles; aucune ouverture, frappe ou vente n’est exposée.

## Démarrage local

Node.js 22.12+ (branche LTS conseillée), npm et Docker.

```sh
npm ci
cp .env.example .env
# Remplacer CHANGE_ME_LOCAL_PASSWORD dans POSTGRES_PASSWORD et DATABASE_URL.
# Renseigner AUTH_SECRET (openssl rand -base64 32), puis les identifiants OAuth.
docker compose -p elite-pack-foundation up -d
npm run db:deploy
npm run db:seed
npm run dev
```

Dans GitHub OAuth Apps, déclarer le callback `http://localhost:3000/api/auth/callback/github`. Le premier accès crée atomiquement le compte, le portefeuille avec journal initial et le stock passif à zéro. La configuration initiale doit être seedée avant la première connexion. Les sessions sont persistées dans PostgreSQL ; Auth.js gère les cookies HTTP-only, HTTPS en production et les protections CSRF de ses actions. L’application désactive le fournisseur tant que ses identifiants manquent. Aucun mot de passe local n’est accepté. Le rôle ADMIN doit être attribué par un opérateur de confiance, jamais depuis le navigateur.

Auth.js v5 utilise actuellement la version `5.0.0-beta.32` : choix nécessaire à cette intégration App Router, à revalider avant mise en production. Next.js et Prisma sont verrouillés dans `package-lock.json`.

Le compose écoute uniquement sur localhost. Ses identifiants sont destinés au développement. En production, fournir PostgreSQL managé, URL de connexion et secrets via l’environnement. Ne jamais utiliser ces identifiants en production.

## Vérifications

```sh
npm run lint
npm run typecheck
npm test
npm run db:validate
npm run build
npx playwright install chromium
# TEST_DATABASE_URL active aussi le parcours administrateur réel.
TEST_DATABASE_URL="$DATABASE_URL" npm run test:e2e
# Base locale migrée, dédiée aux tests ; les tests annulent leurs écritures.
TEST_DATABASE_URL="$DATABASE_URL" npm run test:integration
```

Pour les commandes de test ci-dessus, exporter `DATABASE_URL` depuis votre configuration locale dans le terminal.

`npm run db:migrate` crée des migrations en développement ; `db:deploy` applique uniquement les migrations existantes. Ne jamais lancer de reset sur une base de production. Les contraintes SQL personnalisées doivent être conservées dans les futures migrations.

## Architecture

- `src/app` : routes publiques françaises, espace joueur et administration protégés côté serveur.
- `src/components/ui` : composants shadcn/ui locaux et tokens Tailwind.
- `src/lib/auth` : Auth.js, adaptation Prisma et contrôles de rôles.
- `src/lib/db` : client Prisma PostgreSQL chargé à la demande.
- `src/providers` : TheSportsDB validé; recherches et imports administratifs avec quota partagé PostgreSQL.
- `src/server` : services d’import, corrections administratives, quotas partagés et contrats des futures opérations.
- `prisma` : schéma, migration initiale, seed non destructif.
- `tests` : tests unitaires, contraintes PostgreSQL et parcours navigateur.

Consulter [l’architecture](docs/architecture.md), [la base](docs/database.md), [le design](docs/design-system.md) et [les skills](docs/skills.md).

## Limites et prochaine étape

Le login OAuth réel nécessite des identifiants et n’est pas simulé par les tests. Le parcours administrateur crée une session PostgreSQL de test pour vérifier les pages et API protégées. Les données de test sont retirées de façon ciblée; aucun reset n’est effectué. Playwright utilise son propre serveur sur le port 3100 et `.next-e2e`, sans réutiliser un serveur ouvert. `PLAYWRIGHT_PORT` permet de changer son port.

Les imports TheSportsDB sont disponibles dans `/admin/imports` après configuration de la clé API et du rôle ADMIN. Recherche par nom, import du catalogue et import d’un athlète par identifiant sont disponibles. Les corrections restent prioritaires aux réimports et les identités ambiguës nécessitent une liaison explicite. Voir [le guide d’import](docs/imports.md).

La génération passive, les achats et l’ouverture sont uniquement modélisés : leurs transactions et tests de concurrence seront implémentés lors de la phase cartes/boosters. Les montants utilisent des entiers PostgreSQL `BIGINT`, à sérialiser en chaînes décimales dans les API. Les images sportives restent masquées jusqu’à validation de leurs droits. Aucun catalogue complet n’est codé en dur.

Avant publication, limiter aussi les routes OAuth à la passerelle d’hébergement. L’audit des dépendances et les vérifications sont détaillés dans [docs/verification.md](docs/verification.md).

Prochaine étape : publier le socle et valider le GitHub Project, ses relations parent/enfant, ses vues et ses automatisations. Ensuite : enrichissement Wikidata et validation des images, puis éditions de cartes et contrôle transactionnel des quantités.

## Travailler en équipe

Lire [CONTRIBUTING.md](CONTRIBUTING.md) pour le démarrage et les PR, [GUIDELINES.md](GUIDELINES.md) pour les conventions et SemVer, puis [le workflow des tickets](docs/workflow.md) pour les statuts et critères DoR/DoD. Les branches de fonctionnalité partent de `dev` (intégration) et `dev` est promue vers `main` (stable) par PR, les deux étant protégées; les versions commencent à `0.1.0`.

Les [automatisations préparées](docs/automations.md) comprennent CI, triage des issues et Dependabot. Leur activation réelle nécessite les fichiers publiés dans le dépôt; les workflows natifs du Project doivent être configurés et démontrés séparément. Les liens du dépôt et du suivi doivent être reportés dans la feuille demandée par le TD après vérification des accès.

Pour vérifier le backlog sans appel GitHub : `npm run project:preview`. Le [guide GitHub Projects](docs/github-projects.md) explique la préparation des sous-issues, des vues et des champs. L’importeur conserve les éléments déjà créés lors d’une reprise; son mode d’application nécessite un projet cible et un accès GitHub explicites.
