# GitHub Projects — préparation du TP

Le backlog versionné `docs/backlog.json` contient quatre epics et seize sous-tâches frontend/backend, avec critères d’acceptation, estimations, priorités, phases et statuts proposés. La préparation locale ne prouve pas qu’un projet GitHub existe ou que ses workflows sont activés.

## Aperçu sans réseau

```sh
npm run project:preview
```

Le script `scripts/project/bootstrap.ts` valide la hiérarchie et affiche un aperçu Markdown. Par défaut, il n’accède pas à GitHub, ne crée pas de client HTTP et ne nécessite aucun jeton. Aucune nouvelle dépendance n’est ajoutée : il utilise Node.js, Zod et tsx déjà présents.

## Destination et application explicite

Le dépôt retenu est `kuro250104/elite-pack`. Créez ou choisissez **un projet Projects existant** appartenant à `kuro250104` puis relevez son identifiant GraphQL `PVT_…`. Le script exige cet identifiant afin de reprendre le même projet après une interruption; il ne crée pas de projet à chaque exécution.

Le jeton doit être fourni exclusivement par l’environnement `GH_TOKEN`. Ne le placez ni dans une commande copiée, ni dans un fichier versionné. Les permissions nécessaires sont l’écriture des issues et labels du dépôt et l’écriture du projet concerné; le jeton doit également pouvoir lire les issues, le propriétaire et le projet.

```sh
npm run project:preview -- --apply --repo kuro250104/elite-pack --owner kuro250104 --project-id PVT_IDENTIFIANT_EXISTANT
```

L’application vérifie le propriétaire du projet, lit toutes les issues ouvertes **et closes**, crée uniquement les labels et issues absents, rattache les sous-issues via l’API REST, ajoute les issues au projet et crée les vues `Kanban Elite Pack` (BOARD) et `Backlog Elite Pack` (TABLE) si leurs noms sont absents. Chaque issue contient un marqueur stable `<!-- elite-pack-backlog:v1:EP01-01 -->`. Une relance retrouve ce marqueur après une écriture interrompue et reprend les liens manquants.

Les corps, labels et états des issues existantes ne sont pas remplacés. Les valeurs des champs et workflows existants ne sont pas modifiées. Un autre parent est un conflit explicite, jamais remplacé automatiquement. Des marqueurs présents dans plusieurs issues arrêtent le script pour permettre une correction humaine. Lancez un seul importeur à la fois : le marqueur facilite la reprise mais n’est pas une contrainte d’unicité atomique côté GitHub. Les réponses réseau ambiguës ne font pas l’objet d’une nouvelle écriture automatique; relancez la commande après vérification.

## Configurer les champs et le tableau

Cette partie est **manuelle** et reste à effectuer dans GitHub; le script ne prétend pas la réaliser.

1. Dans les paramètres du projet, configurer `Status` avec `Backlog`, `Ready`, `In Progress`, `Review`, `Done` dans cet ordre. Ces noms sont les valeurs techniques du backlog; les corps et critères d’acceptation des issues sont français.
2. Créer `Estimation` de type Number (points) et `Priority` de type Single select avec `P1`, `P2`, `P3`. Copier les valeurs initiales depuis les corps des sous-issues; les epics ne portent pas d’estimation à additionner aux enfants.
3. Dans `Kanban Elite Pack`, grouper par `Status`, afficher `Priority`, `Estimation`, labels et parent. Filtrer `-label:"type:epic"` pour afficher les tâches exécutables.
4. Dans `Backlog Elite Pack`, afficher les titres, labels, parent, statut, priorité et estimation. Trier par priorité; utiliser la hiérarchie des sous-issues pour naviguer depuis les epics.
5. Créer une vue `Epics`, filtrée par `label:"type:epic"`, pour suivre les quatre objectifs et leur progression. Une vue `POC` peut filtrer `label:"phase:poc"`.
6. Affecter les statuts proposés après revue. `Review` indique qu’une implémentation locale nécessite une vérification; ce n’est pas une déclaration de livraison. Ne mettre `Done` qu’après validation des critères et merge.

## Activer et vérifier les workflows

Dans les paramètres Workflows du projet, activer les automatismes appropriés : nouvelle issue ajoutée → `Backlog`; issue close → `Done`; issue rouverte → `Ready`. Si les opérations du TP exigent un passage automatique à `Review` à l’ouverture d’une PR, configurer le workflow correspondant ou une Action dédiée. Le script ne crée pas d’Action ni de règle distante.

Tester les règles avec une issue temporaire autorisée, vérifier les changements de statut, puis conserver la capture dans les preuves du TP. Vérifier également qu’un réimport n’écrase pas un statut déplacé manuellement. Les vues créées par API ont leur disposition, mais le regroupement, les filtres, les champs visibles et les workflows nécessitent la configuration ci-dessus.

## Sources officielles vérifiées

- [API REST des sous-issues : lecture du parent et rattachement](https://docs.github.com/en/rest/issues/sub-issues)
- [API GraphQL Projects : items et création des vues BOARD/TABLE](https://docs.github.com/en/graphql/reference/projects)
- [Utiliser l’API pour gérer Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects)
- [Workflows intégrés](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations)

La référence REST consultée utilise la version `2026-03-10`. Les endpoints et mutations sont documentés; leur disponibilité effective et les permissions du compte doivent être vérifiées lors de l’application autorisée.
