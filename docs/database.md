# Fondation PostgreSQL

Le schéma sépare `Athlete`, `CardEdition` et `CardInstance`. Un propriétaire est une référence nullable unique par exemplaire ; aucun index n'interdit les doublons d'une édition chez un joueur. Une carte revendue à la banque est retirée (`retiredAt`, propriétaire nul), sans diminuer le compteur historique de l'édition. La découverte est conservée séparément.

Les monnaies sont des entiers PostgreSQL `BIGINT` et TypeScript `bigint`. Les réponses JSON devront convertir explicitement les montants en chaînes décimales. Aucun calcul monétaire ne doit utiliser des nombres flottants. Les probabilités et le taux de reprise sont des points de base entiers (10 000 = 100 %).

Le seed ne contient ni athlètes ni catalogue sportif fictif. Il crée uniquement une configuration initiale et un booster Multisport désactivé avec les six probabilités par défaut. Les opérations `upsert` ne remplacent pas les choix administratifs existants.

## Commandes

Configurer `DATABASE_URL`, puis exécuter `npm run db:generate`, `npm run db:deploy` et `npm run db:seed`. La migration initiale est additive et ne contient aucun reset. Pour les changements suivants, générer et relire une migration avant déploiement. Une connexion directe PostgreSQL est préférable pour les migrations si l'application utilise un pool externe.

## Limites intentionnelles

Les CHECK SQL protègent les valeurs et l'index partiel interdit plusieurs annonces actives pour une carte. Ils ne suffisent pas à implémenter le jeu. Les futurs services doivent effectuer les réservations, transferts, incréments de stock et écritures de journal dans une seule transaction, avec verrous ou mises à jour conditionnelles, puis gérer les conflits et l'idempotence.

L'invariant `mintedSupply <= maxSupply` empêche un compteur invalide, mais le service de frappe devra impérativement incrémenter ce compteur conditionnellement dans la même transaction que chaque insertion d'exemplaire. Le compteur historique ne doit jamais être décrémenté, même après retrait d'une carte.

La somme des six poids doit être validée à 10 000 avant toute activation/ouverture ; un CHECK par ligne ne peut pas garantir cette somme. Les restrictions de catalogue, droits d'image et autorisations administratives restent à appliquer côté serveur.

Le stock passif commence à zéro. La création du joueur devra créer son portefeuille et son état passif avec `nextGenerationAt = heure serveur + intervalle configuré`. À stock plein, l'échéance devient nulle ; après consommation, elle reprend selon les règles documentées dans AGENTS.md. Aucun cron par joueur n'est requis.

Les identifiants externes empêchent l'import répété d'une même source. Le rapprochement entre fournisseurs nécessitera une stratégie explicite fondée sur les identifiants partagés ; les homonymes ne doivent pas être fusionnés automatiquement.

Les modèles Auth.js sont `User`, `Account`, `Session` et `VerificationToken`, avec les noms attendus par PrismaAdapter. Le rôle par défaut est `PLAYER`. Les comptes, sessions et jetons OAuth ne doivent jamais être retournés par les API publiques.

## Références

- [Prisma ORM 7 : configuration](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference)
- [Prisma ORM 7 : migrations et CLI](https://www.prisma.io/docs/orm/v7/reference/prisma-cli-reference)

## Quotas partagés et traçabilité des imports

`RateLimitBucket` conserve les fenêtres de requêtes dans PostgreSQL, partagé entre instances Next.js. `consumeRateLimit(tx, key, options)` verrouille la ligne, lit l'horloge PostgreSQL après l'attente et réserve un appel. La transaction doit être validée avant le réseau. Plusieurs clés doivent être acquises dans un ordre constant pour éviter les interblocages. Une réservation conservée après un échec réseau compte dans le quota fournisseur, puisque la requête a été tentée.

`ImportJob` conserve désormais l'administrateur initiateur, une clé d'idempotence facultative et le résultat. L'unicité `(actorId, idempotencyKey)` empêche deux jobs pour la même requête administrative. Les historiques existants conservent un initiateur nul. Le service doit vérifier cette clé avant le réseau et rendre le résultat ou l'état du job existant ; une création concurrente doit gérer le conflit unique.

La migration `20261009153000_import_security` est additive : aucune table ni donnée existante n'est supprimée.
