# Carnet de passation — SCRUM-88

## Identité de l’arrivée

- **Ticket confié** — [SCRUM-88 · Liste de souhaits de cartes](https://lemeurvincent31.atlassian.net/browse/SCRUM-88)
- **Branche prévue** — `feat/SCRUM-88-wishlist`
- **PR** — À ouvrir après validation.

## Les quatre questions du ticket

| Question | Réponse |
| --- | --- |
| Quel ticket et quels critères ? | Depuis une fiche athlète, mémoriser une édition manquante. La retrouver dans la collection, accéder au marché si elle est proposée et pouvoir la retirer. |
| Où se trouve la logique métier ? | `src/server/wishlist/service.ts` gère les requêtes, le quota et la concurrence. Les routes obtiennent le joueur depuis sa session. |
| Qu’est-ce qui peut casser ? | Deux ajouts simultanés, un ajout au-delà de 100 éditions, le retrait d’un souhait d’un autre compte ou un mauvais décompte des annonces. |
| Comment tester ? | Exécuter les tests d’API Vitest, les tests d’intégration PostgreSQL et le parcours Playwright aux deux largeurs prévues. |

## Démonstration

1. Ouvrir la fiche d’un athlète et choisir une édition manquante active.
2. Cliquer sur « Ajouter à ma liste de souhaits », puis ouvrir **Collection → Liste de souhaits**.
3. Vérifier les informations de l’édition et, si une autre personne la propose, ouvrir le lien vers les annonces.
4. Retirer l’édition et vérifier sa disparition.

## Pour reprendre ce travail

- **État** — Code et tests rédigés. Validation du build, de PostgreSQL, de l’interface et de la PR en attente.
- **Migration** — `20261120095000_wishlist` ajoute uniquement la table, ses index et ses deux références. SQL rédigé directement car Prisma n’était pas disponible.
- **Vérifications locales** — Le registre npm ne se résout pas dans cette session et le moteur Docker Linux est indisponible. Les commandes ci-dessous ont été tentées, mais les exécutables du projet sont absents.
- **Commandes à relancer** — `npm run lint`, `npm run typecheck`, `npm test`, `npm run db:validate`, `npm run build` et `npm run ladle:build`. Avec une base de test migrée, lancer `npm run test:integration` et `npm run test:e2e`.
- **Points de revue** — Valider les deux opérations simultanées près de la limite, le rendu à 800×600 et le rafraîchissement après retrait.
