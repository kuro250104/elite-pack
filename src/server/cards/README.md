# Domaine cards

`service.ts` expose `mintCardInstance`, la seule voie de création d’un exemplaire (`CardInstance`). L’appelant fournit la transaction : une ouverture de booster frappe ainsi toutes ses cartes de manière atomique.

## Règles garanties

- Les verrous suivent l’ordre sport, athlète, édition (`FOR SHARE` puis `FOR UPDATE`) pour éviter les interblocages entre frappes et ouvertures.
- L’édition, son athlète et son sport doivent être actifs, et la date de sortie atteinte ; sinon `EDITION_UNAVAILABLE`.
- Le compteur `mintedSupply` est incrémenté par un `UPDATE` conditionnel : une édition limitée ne dépasse jamais `maxSupply`, même avec des frappes simultanées. La contrainte SQL `CardEdition_supply_check` sert de dernier rempart.
- Une édition limitée numérote ses exemplaires de 1 à `maxSupply` ; un numéro n’est jamais réattribué, même après retrait. Une édition illimitée ne numérote pas.
- Les doublons sont autorisés : un joueur peut posséder plusieurs exemplaires d’une même édition, et plusieurs joueurs la même édition.
- Un exemplaire a au plus un propriétaire (`ownerId`) ; un exemplaire retiré n’en a plus (`CardInstance_retired_owner_check`).
- La découverte (`CardDiscovery`) est enregistrée une seule fois par joueur et par édition, indépendamment de la possession.

Tests : `tests/integration/card-minting.test.ts`. Voir aussi [les contrats d'architecture](../../../docs/architecture.md).
