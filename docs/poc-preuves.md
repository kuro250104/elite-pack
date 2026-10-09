# Preuves du TD POC — 9 octobre 2026

- [Dépôt public](https://github.com/kuro250104/elite-pack) : commit initial `38c93b4`, arborescence publiée, dépendances verrouillées. `.env`, `node_modules`, Prisma généré et compilations restent exclus. Le premier historique distant ne contient pas les anciens identifiants PostgreSQL locaux.
- [CI réussie du socle](https://github.com/kuro250104/elite-pack/actions/runs/37938740829) : Node 22, 44 tests unitaires, 32 tests PostgreSQL, cinq tests Playwright, lint, types, migration, seed et build réussis.
- [Project public](https://github.com/users/kuro250104/projects/4) : visibilité autorisée explicitement par le propriétaire, quatre EPICs et seize tâches natives, champs Status/Priority/Estimation, 81 points pour les enfants uniquement. La reprise de l’import a retrouvé vingt issues sans en recréer.
- [Vue EPICs](https://github.com/users/kuro250104/projects/4/views/1), [Kanban](https://github.com/users/kuro250104/projects/4/views/2), [Backlog](https://github.com/users/kuro250104/projects/4/views/3) : labels, parents et champs visibles ; Kanban groupé par Status, tri croissant Priority, filtre excluant les EPICs.
- [Ticket de démonstration #24](https://github.com/kuro250104/elite-pack/issues/24) : création → ajout automatique et Backlog ; clôture → Done ; réouverture → Ready. Chaque état a été lu via l’API après l’événement. Le ticket est finalement clôturé ; sa trace est conservée.
- [Workflows natifs](https://github.com/users/kuro250104/projects/4/workflows) : ajout au Project des nouvelles issues ouvertes du dépôt, ajout des sous-issues, statut initial Backlog, clôture Done, réouverture Ready et PR liée Review. La transition PR liée est configurée ; sa preuve sera complétée lors de la PR de documentation.
- Les vingt exécutions du triage d’issues initiales ont réussi. Le label `status:backlog` est un marqueur de triage initial ; le champ Status du Project fait autorité lors des transitions suivantes.

## Limites de rendu

La protection distante de `main` et des tags n’est pas configurée. La connexion OAuth réelle du jeu et les imports réels de données sportives n’ont pas été exécutés. Les fonctionnalités économiques avancées restent au backlog.

La feuille du TD n’a pas été modifiée : aucun nom, numéro de groupe ou ligne de destination n’a été identifié. Les deux liens ci-dessus sont disponibles pour le rendu ; une ligne doit être identifiée avant toute écriture dans une feuille partagée.
