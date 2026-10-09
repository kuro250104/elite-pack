# Conformité au TD POC

Référence : `TD_ POC (1).pdf`, deux pages. Le TD demande une documentation Markdown, une stratégie de branches et un outil de gestion réellement utilisable. Le suivi doit présenter au moins quatre EPICs, chacun avec un travail frontend et backend, leurs enfants, des estimations, labels/champs, boards et une automatisation de base. Les liens GitHub et outil doivent être inscrits dans la feuille de rendu.

Ce document distingue les éléments préparés localement des preuves nécessitant un dépôt et un projet GitHub réels. Il ne constitue pas une note attribuée par le correcteur.

## Matrice du barème — 10 points

| Critère | Points | Preuve disponible | État et preuve encore nécessaire |
| --- | ---: | --- | --- |
| Documentation Markdown | 1 | [README](../README.md), [CONTRIBUTING](../CONTRIBUTING.md), [GUIDELINES](../GUIDELINES.md), [workflow](workflow.md) | Rédigée localement ; vérifier les liens après publication du dépôt |
| Contexte du projet | 1 | Présentation du TCG dans README, CONTRIBUTING et AGENTS ; architecture et limites documentées | Documenté localement ; le POC distingue socle réalisé et jeu futur |
| Installation | 2 | Prérequis, `.env.example`, Docker Compose, `npm ci`, migrations, seed et vérifications dans README/CONTRIBUTING | Procédure disponible ; preuves des commandes réellement exécutées dans [verification.md](verification.md), vérifier aussi le futur setup/CI sur clone propre |
| Stratégie de branches | 2 | GitHub Flow, conventions, revue, SemVer et protection dans CONTRIBUTING/GUIDELINES/workflow | Stratégie documentée ; protection réelle de `main` et des tags à vérifier sur le dépôt GitHub |
| Hiérarchie des tâches | 1 | Découpage de quatre EPICs avec enfants frontend/backend dans workflow et plan local de tickets | **À matérialiser** : issues GitHub et liens natifs parent/sous-issue ; le plan JSON ne suffit pas |
| Automatisation basique | 1 | Procédure d’ajout au board et transitions décrite dans workflow | **À configurer et démontrer** sur un vrai GitHub Project ; CI seule ne valide pas l’automatisation de suivi |
| Labels, champs et recherche | 1 | Types, identifiants, priorité, estimation, responsable, domaine, statut et filtres définis dans workflow | **À créer dans l’outil** puis tester la recherche d’un ticket réel |
| Boards | 1 | Colonnes Backlog, Ready, In Progress, Review, Done ; DoR/DoD définies | **À créer et rendre accessible** ; une table Markdown ne remplace pas un board opérationnel |

## Livrables et accès

| Livrable demandé | Situation actuelle |
| --- | --- |
| README à la racine | Présent, installation et contexte documentés |
| Documents de contribution/conventions | CONTRIBUTING.md et GUIDELINES.md préparés |
| Au moins quatre EPICs | Découpage préparé ; nombre et relations doivent être vérifiés dans l’outil réel |
| Enfants frontend/backend | Prévus pour chaque EPIC ; issues natives restant à créer |
| Estimations et priorités | Convention définie ; champs réels restant à renseigner |
| Lien du dépôt GitHub dans la feuille | Dépôt cible fourni : [kuro250104/elite-pack](https://github.com/kuro250104/elite-pack) ; publication et inscription dans la feuille à vérifier |
| Lien de l’outil de gestion | Aucun GitHub Project réel vérifié ; non renseigné |
| Accès du correcteur | À tester lorsque les URL et règles de partage sont disponibles |

## Preuves à collecter pour fermer le rendu

1. URL du dépôt réel, branche `main`, documentation et exécution CI vérifiée sur une PR.
2. URL du Project, accès correcteur et board avec les cinq colonnes.
3. Quatre issues EPIC avec au moins un enfant frontend et un enfant backend chacune, reliés par la relation native.
4. Vue présentant labels, responsables, priorités et estimations ; recherche d’un ticket par domaine et statut.
5. Ticket de démonstration établissant l’ajout automatique et les transitions du board.
6. Protection vérifiée de `main` et des tags `v*`, procédure de version documentée sans publication automatique.
7. Liens du dépôt et de l’outil inscrits dans la feuille demandée, avec accès vérifié.

Les tests du code et les migrations PostgreSQL sont des preuves techniques utiles ; ils ne remplacent pas les preuves de configuration de l’outil de gestion. Aucune création distante, protection, publication, automatisation active ou conformité complète du rendu n’est revendiquée ici.
