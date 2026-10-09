# Conformité au TD POC

Référence : `TD_ POC (1).pdf`, deux pages. Le TD demande une documentation Markdown, une stratégie de branches et un outil de gestion utilisable, avec au moins quatre EPICs, leurs enfants frontend/backend, estimations, labels/champs, boards et automatisation. Les liens du dépôt et de l’outil doivent être inscrits dans la feuille de rendu.

## État vérifié le 9 octobre 2026

Le [dépôt public](https://github.com/kuro250104/elite-pack) est publié sur `main` au commit `38c93b4`. Le [Project public nº 4](https://github.com/users/kuro250104/projects/4) contient les quatre EPICs et seize sous-issues natives, soit les issues nº 1 à 20. La [CI distante](https://github.com/kuro250104/elite-pack/actions/runs/37938740829) a réussi : lint, TypeScript, 44 tests unitaires, 32 tests PostgreSQL, cinq parcours E2E et compilation.

Ce document recense les preuves disponibles et les éléments restant à vérifier. Il ne constitue pas une note attribuée par le correcteur et ne revendique pas une conformité complète du rendu.

## Matrice du barème — 10 points

| Critère | Points | Preuve disponible | Vérification restante |
| --- | ---: | --- | --- |
| Documentation Markdown | 1 | [README](../README.md), [CONTRIBUTING](../CONTRIBUTING.md), [GUIDELINES](../GUIDELINES.md), [workflow](workflow.md), publiés dans le dépôt | Relire les liens avant remise |
| Contexte du projet | 1 | TCG multisport, architecture et séparation entre socle réalisé et fonctionnalités futures documentés | Revue finale du correcteur |
| Installation | 2 | Procédure, environnement d’exemple, migrations/seed et [CI sous Node.js 22 réussie](https://github.com/kuro250104/elite-pack/actions/runs/37938740829) | Vérification du démarrage OAuth complet avec identifiants configurés |
| Stratégie de branches | 2 | GitHub Flow, revue, SemVer et règles proposées documentés | Protection de `main` et des tags `v*` **non configurée et non testée** |
| Hiérarchie des tâches | 1 | Quatre EPICs et seize enfants frontend/backend, reliés par les sous-issues natives dans le [Project](https://github.com/users/kuro250104/projects/4) | Conserver l’accès lors de la remise |
| Automatisation basique | 1 | Huit workflows Projects activés ; issue [nº 24](https://github.com/kuro250104/elite-pack/issues/24) ajoutée automatiquement en Backlog puis clôturée automatiquement en Done ; vingt exécutions de triage réussies | Réouverture vers Ready vérifiée ; PR nº 25 liée à l’issue nº 4 : passage Ready → Review vérifié, fusion vers Done restant à démontrer |
| Labels, champs et recherche | 1 | Labels de domaine/type/phase/priorité ; Status à cinq valeurs ordonnées, Priority P1/P2/P3 et Estimation ; total de 81 points sur les enfants | Réaliser la recherche de démonstration demandée et vérifier les responsables selon l’organisation du groupe |
| Boards | 1 | Vues EPICs en table, Kanban groupé par Status et trié par Priority, backlog en table avec champs visibles | Conserver les captures ou liens des vues pour le rendu |

## Livrables et accès

| Livrable demandé | Situation actuelle |
| --- | --- |
| Dépôt GitHub | [kuro250104/elite-pack](https://github.com/kuro250104/elite-pack), public et publié |
| README et conventions | Documents présents dans le dépôt publié |
| Au moins quatre EPICs | Quatre issues EPIC et relations natives vérifiées |
| Enfants frontend/backend | Seize enfants au total, répartis dans les quatre EPICs |
| Estimations et priorités | Champs réels renseignés ; 81 points pour les seize enfants |
| Outil de gestion | [GitHub Project nº 4](https://github.com/users/kuro250104/projects/4), public |
| Liens dans la feuille Google de rendu | **Feuille non éditée** : nom ou numéro de groupe et ligne correspondante non fournis |
| Protection des branches et tags | **Non configurée et non testée** |

## Pour terminer la remise

1. Configurer et tester la protection de `main` et des tags `v*` selon la stratégie documentée.
2. Terminer, si exigées, les démonstrations des transitions PR vers Review et fusion vers Done.
3. Identifier la ligne du groupe dans la feuille Google puis y inscrire les liens du dépôt et du Project.
4. Vérifier l’accès du correcteur, les responsables et les recherches attendues ; conserver les preuves du board et des automatismes.

Les [preuves du POC](poc-preuves.md) réunissent les vérifications distantes. Les tests techniques, la hiérarchie distante et les automatismes démontrés sont des preuves distinctes. Les protections et l’inscription dans la feuille restent nécessaires pour fermer le rendu.
