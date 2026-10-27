# Workflow de contribution et suivi du POC

## Organisation choisie

Utiliser GitHub Issues et GitHub Projects pour réunir tickets, pull requests, board et automatisations. Le dépôt cible est [kuro250104/elite-pack](https://github.com/kuro250104/elite-pack), fourni par l’utilisateur et vérifié vide. Le Project distant reste à configurer. Le plan local de tickets n’est pas un board utilisable.

## Branches et protections

Le projet utilise un flux à deux branches permanentes :

| Branche | Rôle | Reçoit des PR depuis |
| --- | --- | --- |
| `main` | Version stable, seule source des tags `vX.Y.Z` | `dev` (promotion) ou `hotfix/*` |
| `dev` | Intégration et tests ; branche par défaut du dépôt | branches de fonctionnalité |
| `feat/`, `fix/`, `docs/`, `test/`, `chore/` | Un ticket, une branche courte issue de `dev` | — |
| `hotfix/` | Correction urgente issue de `main` | — |

Exemples : `feat/EP02-02-import-athlete`, `fix/EP04-01-stock`, `docs/EP01-03-installation`, `test/EP03-01-concurrency`, `chore/EP01-03-ci`.

1. Une branche de fonctionnalité part de `dev` et revient vers `dev` par PR, fusionnée en squash une fois la CI verte. La branche est supprimée automatiquement après fusion.
2. Lorsque `dev` est stable et vérifiée, une PR de promotion `dev` → `main` est ouverte et fusionnée par commit de fusion, afin de conserver l’historique commun des deux branches.
3. Un `hotfix/*` part de `main`, revient vers `main`, puis `main` est refusionnée dans `dev`.

Rulesets GitHub actifs (Settings → Rules → Rulesets) :

- **Protection main** : PR obligatoire, conversations résolues, approbations invalidées par un nouveau push, contrôles obligatoires « Lint, types, tests et compilation » et « Origine de la PR vers main », pushes forcés et suppression interdits, aucun contournement.
- **Protection dev** : PR obligatoire, conversations résolues, contrôle obligatoire « Lint, types, tests et compilation », pushes forcés et suppression interdits, aucun contournement.
- **Protection des tags de version** : les tags `v*` ne peuvent être ni modifiés ni supprimés ; seule l’administration peut les créer.

Le nombre d’approbations obligatoires est fixé à zéro tant que le dépôt n’a qu’un seul collaborateur, GitHub interdisant d’approuver sa propre PR. Il doit passer à une approbation dès qu’un second membre rejoint le dépôt. La présence des fichiers du dépôt ne prouve pas que ces règles sont activées ; vérifier les rulesets distants.

## Hiérarchie des tickets

Prévoir au moins quatre EPICs. Chacun contient au minimum un enfant frontend et un enfant backend, ce qui satisfait également l’exigence de deux EPICs full stack. Utiliser les relations natives parent/sous-issue de GitHub, plutôt qu’une simple mention dans une description. L’EPIC contient l’objectif, le périmètre, les enfants et le résultat attendu. Une dépendance entre deux tickets est distincte de la relation parent/enfant.

Plan de découpage :

| EPIC | Objectif | Exemple enfant frontend | Exemple enfant backend |
| --- | --- | --- | --- |
| Fondation et accès | Installation, sessions et rôles | Parcours français de connexion | Auth.js, création atomique du joueur |
| Catalogue sportif | Sports, athlètes et imports sûrs | Administration et revue des données | Import TheSportsDB, déduplication et quotas |
| Cartes et collection | Éditions, exemplaires et découvertes | Collection filtrable et détail athlète | Modèles, propriété et limites de tirage |
| Boosters gratuits et ouverture | Génération et ouverture | Stock passif et révélation des cartes | Transactions, idempotence et tirage sécurisé |

Les enfants doivent être assez petits pour être revus séparément. Ne pas lancer les systèmes économiques avant validation des fondations. Un ticket préparé pour un travail déjà réalisé ne passe à `Done` qu’après vérification de ses preuves et de ses critères.

## Champs et recherche

Chaque ticket utilise : identifiant stable `EP01-01`, type (`Epic`, `Feature`, `Bug`, `Task`), statut, priorité (`P0` à `P3`), estimation (`1`, `2`, `3`, `5`, `8` points), responsable et EPIC parent. L’estimation représente une complexité relative, pas une durée promise.

Labels proposés : `type:epic`, `type:feature`, `type:bug`, `area:frontend`, `area:backend`, `domain:auth`, `domain:imports`, `domain:cards`, `domain:boosters`, `domain:economy`, `security`, `database`, `tests`, `documentation`, `blocked`. Ne pas remplacer les champs structurés par des labels redondants de priorité ou de statut. Le plan JSON doit être matérialisé en issues et champs du projet.

Un blocage conserve le statut courant, reçoit le label `blocked`, explique la dépendance et le prochain élément nécessaire. Les vues doivent permettre de retrouver les tickets par responsable, domaine, priorité, parent et statut. Ajouter une vue dédiée aux EPICs et à leurs enfants.

## Board et critères de passage

Créer un board dont les colonnes reflètent exactement le champ `Status` :

| Statut | Critère d’entrée | Critère de sortie |
| --- | --- | --- |
| Backlog | Besoin identifié et rattaché à un EPIC | Périmètre et critères clarifiés |
| Ready | DoR satisfaite et dépendances disponibles | Responsable nommé et travail commencé |
| In Progress | Branche créée et responsable actif | PR prête, vérifications locales exécutées |
| Review | PR ouverte, preuves et critères documentés | Revue approuvée, CI requise verte, PR fusionnée |
| Done | DoD satisfaite | Réouverture uniquement si une exigence reste insatisfaite |

Créer aussi une vue tableau pour les estimations et une vue filtrée par EPIC. Le board doit être effectivement accessible aux membres et au correcteur selon les règles de partage de l’équipe. Vérifier son URL et ses permissions avant de l’inscrire dans la feuille de rendu.

## Definition of Ready — DoR

Un ticket `Ready` comporte un problème clair, un résultat observable, ses critères d’acceptation, un parent, le périmètre frontend/backend, une priorité et une estimation. Les dépendances, besoins de données, droits d’images et implications de sécurité sont identifiés. Les critères sont assez précis pour écrire les tests nécessaires.

## Definition of Done — DoD

Les critères d’acceptation sont vérifiés, le code est revu et fusionné sur `dev`, les contrôles requis passent et leurs preuves sont liées à la PR. La documentation pertinente est à jour. Toute migration est relue et vérifiée sur une base de test ; les règles économiques nouvelles ont des tests d’intégration et de concurrence adaptés. Les textes sont français et les changements d’interface respectent accessibilité et responsive. Les limites restantes sont documentées dans un ticket distinct si elles ne font pas partie des critères.

## Automatisations à configurer et vérifier

Activer les workflows natifs du projet pour ajouter les nouvelles issues du dépôt, attribuer `Backlog` à l’arrivée et passer les issues fermées à `Done` après contrôle de la DoD. Lorsqu’un ticket est rouvert, revenir à `Backlog` et réévaluer la DoR. Une PR utilise `Closes #123` pour fermer l’issue enfant à la fusion. L’EPIC n’est terminé qu’après validation de tous ses enfants et de son objectif.

L’ajout automatique ne reprend pas rétroactivement les éléments existants à son activation : ajouter explicitement les tickets déjà créés au projet. Ces comportements sont documentés dans [les automatisations natives](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations) et [l’ajout automatique](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/adding-items-automatically).

Les automatisations natives doivent être contrôlées avec un ticket de démonstration : créer une issue, constater son arrivée et son statut dans le board, puis fermer/réouvrir cette issue et vérifier les transitions. Ne pas considérer une description de workflow ou un fichier JSON comme une automatisation active. Conserver les liens du ticket et du projet comme preuves.

La CI exécute les contrôles de qualité configurés à chaque PR et à chaque push sur `main` et `dev`. GitHub conserve la trace des exécutions ; la présence du fichier YAML seule ne démontre pas une exécution réussie. Les automatismes de CI ne constituent pas, à eux seuls, l’automatisation du board demandée dans le TD.

## Versions et releases

La version actuelle est `0.1.0`. Une correction compatible incrémente le patch ; une fonctionnalité ou rupture documentée incrémente le minor pendant le POC. À partir de `1.0.0`, une rupture de contrat incrémentera le major. Tenir un changelog avec ajouts, corrections, sécurité, migrations et ruptures.

Pour publier une release : PR de version vers `dev`, promotion `dev` → `main`, contrôles requis, tag annoté `vX.Y.Z` sur le commit vérifié, puis release GitHub avec notes et liens des tickets. Configurer un ruleset pour protéger `v*`. La publication est une action explicite, sans automatisme de déploiement ou publication de paquet. Le dépôt est marqué `private: true` dans `package.json`.

## Rendu du TD

Renseigner dans la feuille demandée par l’enseignant le lien du dépôt GitHub et celui du GitHub Project. Tester l’accès avec le compte du correcteur ou les permissions prévues. Les URL réelles doivent remplacer toute mention « à configurer ». La feuille est référencée dans le PDF : [Suivi des projets](https://docs.google.com/spreadsheets/d/1TTSPEPNQ5CA_rthjnB8g4ltf73NEE_38Qv-vQ4ofSps/edit?gid=0#gid=0). Les accès, la ligne du groupe et le lien du Project restent à vérifier avant inscription.
