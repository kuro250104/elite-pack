# Automatisations et suivi du travail

Les fichiers du dépôt préparent les automatisations suivantes. Leur exécution distante dépend d’un dépôt GitHub contenant ces fichiers et de GitHub Actions activé. Aucun résultat de CI distante ni aucune activation de tableau Projects n’est présumé.

## Vérifications automatiques

`.github/workflows/ci.yml` s’exécute sur les PR, les push vers `main` et à la demande. Node.js 22 utilise le lockfile avec `npm ci`. Les étapes couvrent génération et validation Prisma, ESLint, TypeScript, Vitest, migrations, seed, tests PostgreSQL, Playwright Chromium et compilation Next.js.

PostgreSQL 17 est un service éphémère du job. Les identifiants présents dans le YAML et `AUTH_SECRET` sont exclusivement des valeurs publiques de test. Aucun secret de production, jeton OAuth ni clé TheSportsDB n’est fourni aux PR. Les tests fournisseurs utilisent leurs fixtures. La CI possède uniquement `contents: read`, ne conserve pas les credentials Git et annule une ancienne exécution de la même branche lorsqu’une nouvelle arrive. Aucun déploiement n’est automatique.

Le nom du job à rendre obligatoire dans les règles de branche est **Lint, types, tests et compilation**. Cette règle reste à activer après création du dépôt ; sa présence dans le YAML ne protège pas automatiquement `main`.

## Triage et mises à jour

`.github/workflows/issue-triage.yml` attribue `status:backlog` aux nouvelles issues. Le champ « Domaine » d’un formulaire sélectionne un label parmi une liste fermée : `area:frontend`, `area:backend`, `area:transverse`. Le script lit le payload GitHub comme donnée, sans l’interpoler dans une commande shell et sans checkout de code utilisateur. Seul ce workflow dispose de `issues: write` pour ajouter les labels. Il ne modifie pas le statut d’un tableau Projects.

Le triage intervient à l’ouverture uniquement : une modification ultérieure du domaine exige une mise à jour manuelle du label. Les labels `type:epic`, `type:feature` et `type:bug` doivent être créés lors de l’initialisation du dépôt pour être appliqués par les formulaires.

Dependabot propose chaque lundi à 08:00, heure de Paris, les mises à jour npm et GitHub Actions. Les versions npm mineures et correctives sont regroupées ; les versions majeures npm restent séparées pour faciliter la revue. Ces PR doivent passer la CI et une revue humaine. Aucune fusion automatique n’est configurée.

## Tableau Projects et liens parents-enfants

Après création du dépôt et du Project, créer un champ **Status** avec **Backlog**, **Ready**, **In Progress**, **Review**, **Done**, puis des vues distinctes Frontend et Backend basées sur les labels de domaine. La relation native issue parent / sous-issue représente les EPIC et leurs fonctionnalités ; le champ textuel « EPIC parent » du formulaire sert à identifier le parent, mais ne crée pas ce lien automatiquement.

Dans le menu du Project, ouvrir **Workflows** puis configurer et activer les règles souhaitées :

| Déclencheur | Action à configurer |
| --- | --- |
| Élément ajouté au Project | Status → Backlog |
| Issue clôturée | Status → Done |
| PR fusionnée | Status → Done |
| Ajout automatique depuis le dépôt | Ajouter les issues répondant au filtre choisi, selon les possibilités du compte |

Ces règles concernent les éléments du Project. L’auto-ajout est une configuration distincte et ses disponibilités dépendent de l’offre GitHub. Vérifier dans l’interface les workflows disponibles et la correspondance des noms de statuts. Tester avec une issue temporaire liée au Project, puis la clôturer et vérifier son déplacement. Conserver une capture ou le lien de la vérification pour le POC.

**État actuel : configuration Projects à réaliser après création du Project.** Les fichiers locaux n’activent pas ces règles. Aucune URL de Project ni aucun numéro d’issue réel n’est inventé.

## Vérification et sources

Les YAML peuvent être contrôlés localement avec un parseur et les scripts de triage peuvent être testés avec un payload simulé. La CI complète doit ensuite être observée dans l’onglet Actions du dépôt. Une validation locale n’est pas une exécution GitHub Actions.

Sources officielles consultées le 9 octobre 2026 : [checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node), [github-script](https://github.com/actions/github-script), [automatisations Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations), [configuration Dependabot](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference). Les versions majeures référencées sont celles indiquées par les dépôts officiels lors de cette préparation.
