# GitHub Projects — état du TP et reprise

Le [Project public nº 4](https://github.com/users/kuro250104/projects/4) est configuré pour le [dépôt public kuro250104/elite-pack](https://github.com/kuro250104/elite-pack). Le backlog versionné `docs/backlog.json` correspond aux quatre EPICs et seize sous-issues natives créés dans les issues nº 1 à 20.

## Configuration vérifiée

- `Status` contient, dans cet ordre : `Backlog`, `Ready`, `In Progress`, `Review`, `Done`.
- `Priority` est un champ à sélection unique : `P1`, `P2`, `P3`.
- `Estimation` est numérique. Les seize enfants totalisent 81 points ; les EPICs ne sont pas additionnés à ce total.
- La vue EPICs est une table filtrée sur `type:epic`.
- La vue Kanban est un board filtré pour exclure les EPICs, groupé par `Status` et trié par `Priority`.
- La vue backlog est une table avec les champs de suivi visibles.
- Huit workflows natifs sont activés. Leur détail et les démonstrations sont consignés dans [automations.md](automations.md).

Les statuts `Review` des éléments déjà implémentés correspondent à une revue à effectuer; ils ne déclarent pas toutes les fonctionnalités du jeu livrées. L’ouverture des boosters, la collection et l’économie restent les prochaines phases du développement.

## Aperçu local sans réseau

```sh
npm run project:preview
```

Le script `scripts/project/bootstrap.ts` valide la hiérarchie et affiche un aperçu Markdown. Par défaut, il n’accède pas à GitHub, ne crée pas de client HTTP et ne nécessite aucun jeton. Il utilise Node.js, Zod et tsx déjà présents.

## Reprendre l’import vers le même projet

L’application exige explicitement le dépôt, le propriétaire et l’identifiant GraphQL `PVT_…` du **projet existant**. Ne créez pas un autre projet pour reprendre une exécution. L’identifiant GraphQL n’est pas le numéro `4` de l’URL.

```sh
npm run project:preview -- --apply --repo kuro250104/elite-pack --owner kuro250104 --project-id PVT_IDENTIFIANT_DU_PROJET_4
```

Le jeton est fourni exclusivement par l’environnement `GH_TOKEN`, jamais dans la commande ni dans un fichier versionné. Les permissions nécessaires sont l’écriture des issues et labels du dépôt ainsi que l’écriture du projet. La connexion du plugin GitHub dans Codex ne fournit pas automatiquement un jeton au script local.

L’importeur vérifie le propriétaire, lit toutes les issues ouvertes **et closes**, crée les labels et issues absents, rattache les enfants avec l’API REST des sous-issues et ajoute les issues au projet. Les vues `Kanban Elite Pack` et `Backlog Elite Pack` sont créées seulement si leurs noms sont absents. Les valeurs GraphQL effectivement validées sur l’API sont `BOARD_LAYOUT` et `TABLE_LAYOUT` pour `ProjectV2ViewLayout`.

Chaque issue possède un marqueur stable, par exemple `<!-- elite-pack-backlog:v1:EP01-01 -->`. La reprise réelle a été exécutée : **0 issue créée, 20 réutilisées**. Les corps, labels, états et champs existants sont préservés. Un autre parent ou des marqueurs dupliqués provoquent un arrêt plutôt qu’un remplacement. Un seul importeur doit être exécuté à la fois : le marqueur permet la reprise mais ne constitue pas une contrainte d’unicité atomique côté GitHub.

## Ce que le script ne configure pas

La configuration des champs, de leurs valeurs, des filtres, du regroupement, du tri et des workflows a été réalisée séparément dans GitHub. Elle est présente et vérifiée dans le Project nº 4 ; le script ne réalise pas automatiquement cette partie lors d’un import vers un autre projet.

Pour reproduire ce suivi ailleurs, créer les champs ci-dessus, renseigner les estimations et priorités à partir du backlog, afficher les tâches dans le Kanban et conserver une vue distincte des EPICs. Les règles de workflow doivent être activées puis démontrées dans le projet concerné.

## Points restant à fermer

La protection réelle de `main` et des tags n’est ni configurée ni testée. La feuille Google de rendu n’a pas été éditée : la ligne du groupe n’est pas identifiée. Le cycle de démonstration de l’issue nº 24 a confirmé Backlog, Done puis Ready après réouverture. La PR nº 25 liée au ticket nº 4 a démontré le passage Ready → Review. La fusion vers Done reste à démontrer après revue. Ces limites figurent dans [poc-conformite.md](poc-conformite.md).

## Sources officielles

- [API REST des sous-issues](https://docs.github.com/en/rest/issues/sub-issues)
- [API GraphQL Projects : items, champs et vues](https://docs.github.com/en/graphql/reference/projects)
- [Utiliser l’API pour gérer Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects)
- [Workflows intégrés](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations)

La référence REST consultée utilise la version `2026-03-10`. Les relations, vues et la reprise ont été vérifiées sur le projet réel.
