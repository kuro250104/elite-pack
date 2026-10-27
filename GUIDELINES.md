# Conventions de développement

## Produit et architecture

L’application est entièrement en français ; les identifiants techniques peuvent être en anglais. Formater les dates et les nombres en `fr-FR`. Préserver une interface accessible, responsive, sombre et cohérente avec [le système de design](docs/design-system.md).

Privilégier les composants serveur du routeur App Router. Employer un composant client lorsque l’interaction le nécessite. Garder les routes API fines : validation Zod, authentification, autorisation puis appel du service de domaine. Le code métier appartient à `src/server`, les intégrations externes à `src/providers`.

TypeScript reste strict. Éviter `any` et les assertions qui masquent un contrat invalide. Valider les entrées utilisateur et les réponses des fournisseurs. Ne pas ajouter de dépendance sans besoin démontré ; inspecter les outils et skills existants.

## Données et sécurité

Distinguer systématiquement `Athlete`, `CardEdition` et `CardInstance`. Les doublons sont autorisés ; chaque exemplaire a au maximum un propriétaire. Les quantités limitées, portefeuilles, consommations et transferts doivent être atomiques et protégés contre la concurrence. Utiliser des clés d’idempotence pour les opérations critiques.

Stocker les montants en `BIGINT`, les manipuler en `bigint` et les sérialiser en chaînes décimales dans les API. Les probabilités et paramètres économiques restent configurables dans PostgreSQL. Les résultats de boosters utiliseront une source aléatoire cryptographique côté serveur.

PostgreSQL est l’autorité pour le temps, le stock et les quotas partagés. Le minuteur du navigateur reste informatif. La génération passive prévue est de un booster toutes les 15 minutes, avec un plafond de dix, y compris hors connexion ; ne pas créer de cron par joueur.

Vérifier les rôles côté serveur et ne jamais accepter un rôle administrateur du client. Conserver les secrets hors du dépôt et du bundle navigateur. Les imports utilisent TheSportsDB comme source principale, sans appel externe durant les ouvertures. Les images restent masquées tant que leurs droits n’ont pas été validés.

## Tests et migrations

Tester les règles critiques avec Vitest, les contraintes et transactions sur PostgreSQL réel, les parcours essentiels avec Playwright. Un test doit vérifier un comportement observable ou un invariant utile. Ne pas déclarer une vérification réussie sans l’avoir exécutée.

Une migration doit être versionnée, relue et explicitée dans la PR. Préférer un changement additif ; une suppression ou transformation risquée nécessite un plan de reprise. Ne jamais lancer un reset de production. Consulter [la documentation PostgreSQL](docs/database.md) pour les contraintes SQL non représentées dans Prisma.

## Branches, commits et versions

Suivre [le flux `dev` / `main` et le workflow des tickets](docs/workflow.md#branches-et-protections). Une branche courte issue de `dev` concerne un ticket ou un changement cohérent ; ne pas mélanger une fonctionnalité et une refonte indépendante. `dev` et `main` doivent rester vérifiables ; aucun push direct n’y est accepté.

La version initiale est `0.1.0`. Suivre SemVer pendant le POC : `0.MINOR.PATCH`. Incrémenter `PATCH` pour une correction compatible, `MINOR` pour une nouvelle capacité ou une rupture documentée tant que l’API est expérimentale. La version `1.0.0` sera réservée à un contrat stable explicitement accepté par l’équipe. Toute rupture doit figurer dans les notes de release, même avant `1.0.0`.

Une release suit une PR dédiée mettant à jour `package.json` et le lockfile, puis une promotion `dev` → `main` validée. Le tag annoté est `vX.Y.Z`. Configurer un ruleset GitHub protégeant les tags `v*` contre modification/suppression et création non autorisée. Créer la release seulement après vérification de la version, du commit et des contrôles ; la CI ne publie pas automatiquement les releases, paquets ou sites.

## Revue

La revue vérifie le comportement, les critères du ticket, l’autorisation, les cas limites, la concurrence, l’accessibilité et les migrations concernées. Demander des changements concrets et justifiés. Les preuves de validation et les limites doivent être compréhensibles par un membre de l’équipe qui n’a pas suivi la conversation initiale.
