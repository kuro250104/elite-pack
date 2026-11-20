# Carnet de passation — SCRUM-111

- **Ticket** — [SCRUM-111 · Historique du portefeuille](https://lemeurvincent31.atlassian.net/browse/SCRUM-111)
- **Branche** — `feat/SCRUM-111-wallet-history`
- **PR** — À ouvrir après vérification et après la PR de SCRUM-88.

## Les quatre questions du ticket

| Question | Réponse |
| --- | --- |
| Quel ticket et quels critères ? | Afficher le solde, les totaux et les mouvements du joueur. Filtrer par type et conserver le filtre entre les pages. |
| Où se trouve la logique métier ? | `src/server/wallet/history.ts` lit le portefeuille et ses mouvements. La route et la page utilisent le joueur de la session. |
| Qu’est-ce qui peut casser ? | La précision des grands montants, le tri de transactions simultanées, l’isolation du joueur et l’affichage des détails d’une référence ancienne. |
| Comment le tester ? | Tests Vitest de la route, intégration PostgreSQL pour l’isolation et la pagination, Playwright en 390×844 et en 800×600. |

## Démonstration

Ouvrir **Mon profil → Voir mon portefeuille**. Vérifier le solde de départ, puis choisir « Revente à la banque » après avoir revendu une carte. Le mouvement doit afficher l’athlète, l’édition, le montant et le solde après l’opération.

## Pour reprendre ce travail

- L’API est documentée dans OpenAPI. Le rendu de chaque type de ligne est présenté dans Ladle.
- Le service lit le solde et la page de mouvements dans le même instantané PostgreSQL et résout les détails par lots.
- Aucune migration. Les montants restent des chaînes décimales dans l’API.
- L’installation a échoué faute d’accès au registre npm. Le moteur Linux de Docker est indisponible. Relancer lint, types, tests, build et Ladle après l’installation, puis les tests PostgreSQL et Playwright avec une base locale de test migrée.
