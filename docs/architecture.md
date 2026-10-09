# Architecture de la fondation

Next.js App Router rend les pages côté serveur. Les composants clients sont réservés aux interactions. Les Route Handlers valident les entrées avec Zod, vérifient la session et délèguent aux services de domaine ; PostgreSQL reste l'autorité pour les stocks, portefeuilles et propriétaires.

## Frontières de domaine

- `providers/` : transport et normalisation des données externes, sans accès aux portefeuilles ni création de cartes.
- `server/imports` : future orchestration d'importation, réservée aux administrateurs, avec journal et déduplication par identifiants externes. Les rapprochements ambigus nécessitent une validation humaine ; le nom seul ne suffit pas. Préserver les champs modifiés par un administrateur.
- `server/athletes`, `server/sports` : futur catalogue PostgreSQL ; traductions des sports avant activation.
- `server/cards` : futures éditions et exemplaires, contrôle atomique de l'offre, historique de découverte indépendant de la propriété.
- `server/boosters` : future transaction regroupant validation des pools, tirage cryptographique, création des exemplaires et consommation. Aucun appel externe pendant une ouverture.
- `server/collection` : futures lectures paginées, `ownerId` provenant exclusivement de la session vérifiée.
- `server/economy`, `server/marketplace` : futures transactions atomiques, ledger, contrôle des soldes entiers, idempotence, réservation conditionnelle d'une annonce.

Les mutations métier ne sont volontairement pas exposées dans cette première phase. Une interface TypeScript décrit leurs entrées attendues, sans prétendre fournir une implémentation transactionnelle.

## Fournisseur TheSportsDB

L'adaptateur utilise uniquement les endpoints V1 documentés : `lookupplayer.php?id=`, `searchplayers.php?p=` et `all_sports.php`. Il ne promet pas d'énumération des athlètes par sport. Les réponses gratuites peuvent être tronquées : recherche limitée à un joueur, catalogue limité à deux sports selon la documentation consultée le 9 octobre 2026. Une réponse n'est donc jamais traitée comme exhaustive.

Le quota gratuit documenté est de 30 requêtes/minute. Chaque instance sérialise les demandes et les espace d'au moins 2,1 secondes. Un import futur devra utiliser un seul worker ou un limiteur partagé pour toutes les instances utilisant la même clé. Les réponses 429 déclenchent au moins une minute d'attente ; le nombre de nouvelles tentatives et les délais réseau sont bornés. Ne jamais journaliser l'URL V1, qui contient la clé.

Les champs optionnels peuvent manquer. Les biographies françaises ne sont pas remplacées automatiquement par un texte anglais. Les images restent des références **non approuvées pour affichage** : licence, attribution et restrictions doivent être vérifiées avant publication. Aucun athlète n'est importé par la fondation.

Sources officielles : [Documentation TheSportsDB](https://www.thesportsdb.com/documentation), [API gratuite](https://www.thesportsdb.com/free_sports_api).

## Contrats de la prochaine phase

Pour toute mutation économique : session serveur → validation Zod → limitation de débit partagée → clé d'idempotence → transaction PostgreSQL → résultat public sans secrets. Les retries de conflits doivent être bornés ; aucun retry ne doit relancer un paiement déjà validé.

La génération passive utilisera l'horloge serveur et les timestamps persistés : stock initial zéro, intervalle configuré initialement à 900 secondes, plafond initial dix, pause au plafond. Consommer à plein redémarre un cycle complet ; consommer sous le plafond conserve la progression. Cette logique et sa concurrence seront testées avant activation de la route.

Les transactions d'ouverture vérifieront tous les pools avant consommation ; un pool vide provoquera un rejet sans redistribution implicite des probabilités. Les probabilités, taille de booster et règles économiques seront lues dans la configuration PostgreSQL.
