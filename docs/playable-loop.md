# Boucle jouable du POC

Le catalogue de démonstration repose sur deux athlètes réellement importés depuis TheSportsDB : Kylian Mbappé (`34162098`, Football) et Lewis Hamilton (`34157136`, Sports automobiles). Il prépare six éditions génériques pour chacun, soit douze éditions : Classique, Découverte, Élite, Prestige, Or et Mythique. Ces noms ne revendiquent aucun titre ou résultat sportif. Aucune image n’est créée ou approuvée par la préparation.

## Préparer la base locale

La configuration du jeu et le modèle `multisport` doivent déjà avoir été initialisés par `npm run db:seed`. Les deux athlètes doivent être actifs et associés à deux sports distincts importés. L’opérateur doit disposer d’un identifiant ADMIN réel en base.

```sh
node --conditions=react-server --import tsx scripts/game/prepare.ts --actor-id ID_ADMIN --confirm
```

La commande charge `.env.local` puis `.env`, préserve les variables du processus et n’effectue aucun appel réseau. `--confirm` est obligatoire avant tout accès à la base. Elle active uniquement les deux sports concernés, avec audit, puis crée le booster **Découverte multisport** (`discovery-booster`, slug `decouverte-multisport`) : cinq cartes, multisport, prix initial zéro. Les éditions initiales sont actives, sans limite de quantité, avec une valeur initiale de zéro.

Les probabilités sont copiées depuis les poids persistés du modèle `multisport` ; les six poids doivent être positifs et totaliser 10 000 points de base. Les réexécutions préservent les éditions existantes, les quantités déjà frappées et les réglages administratifs du booster. Le script ne réactive jamais un athlète désactivé ni un booster existant désactivé. Une édition inactive ou épuisée, une association incorrecte ou des probabilités invalides font échouer et annuler toute la transaction ; un booster nouvellement préparé n’est alors pas créé.

La préparation journalise `GAME_CATALOGUE_PREPARE`. Elle ne crée aucun utilisateur, exemplaire de carte ou crédit et ne donne aucun booster. Elle ne modifie aucun autre sport ni le catalogue d’athlètes.

## Parcours prévu et vérifications

Les boosters de bienvenue appartiennent à l’inventaire de départ, distinct de la génération passive. Le stock passif commence à **zéro**, produit un booster toutes les quinze minutes selon la configuration PostgreSQL et plafonne à dix. Un joueur choisit le sport lors de l’ouverture gratuite ; le stock générique n’est pas attaché à un sport à l’avance. Ce stock n’ouvre que des boosters gratuits de type sport ou multisport, jamais un booster payant ou d’événement.

L’ouverture doit vérifier côté serveur le joueur, l’inventaire ou le stock, les probabilités et toutes les réserves d’éditions éligibles. Le hasard est cryptographique et serveur. Les exemplaires peuvent être des doublons. L’ouverture, le débit du booster et la création des exemplaires forment une transaction ; l’idempotence évite un second débit, les verrous protègent les consommations concurrentes et les offres limitées. Un pool incomplet doit être refusé sans consommer de booster ni redistribuer implicitement les probabilités.

Vérifier localement l’inscription, l’inventaire de bienvenue, l’ouverture de cinq cartes et leur présence dans la collection. Tester également un rejeu de la même clé d’idempotence, un stock vide et une réserve inactive. Les services et tests techniques sont des preuves distinctes de cette vérification du parcours réel.

## Limites

Ce catalogue est une sélection de démonstration, pas une collection exhaustive des sports ou des athlètes. Les références d’images non approuvées restent cachées ; leur revue est indépendante du catalogue. Le marché, la revente bancaire et la valorisation ne font pas partie de cette boucle. Les douze éditions initiales ont une valeur nulle et ne démontrent aucune économie complète.

Le nombre de boosters de bienvenue, l’état réel des pages et les résultats du scénario doivent être vérifiés dans la version exécutée. La présence de ce script ne prouve ni son exécution sur une base donnée ni un déploiement public du parcours.
