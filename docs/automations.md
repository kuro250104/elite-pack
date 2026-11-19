# Automatisations et suivi du travail

Le [dépôt public](https://github.com/kuro250104/elite-pack) et le [Project nº 4](https://github.com/users/kuro250104/projects/4) sont publiés. La CI distante et les automatismes de suivi ont été exécutés ou activés comme indiqué ci-dessous. Activation et démonstration sont distinguées.

## Vérifications automatiques du code

`.github/workflows/ci.yml` s’exécute sur les PR, les push vers `main` et `dev` et à la demande. Node.js 22 installe le lockfile avec `npm ci`, qui génère aussi le client Prisma.

### Orchestration des jobs

La CI est découpée en jobs reliés par `needs`. Chaque job a une limite de durée (`timeout-minutes`), et une nouvelle exécution sur la même branche annule la précédente (`concurrency`).

```text
qualite ─┬─ tests-unitaires ──┐
         ├─ tests-postgresql ─┴─ tests-e2e ─┐
         ├─ compilation ────────────────────┤
         ├─ documentation ──────────────────┼─ verification
         └─ image-docker ───────────────────┘
```

| Job | Rôle | Dépend de | Limite |
| --- | --- | --- | ---: |
| Qualité | Schéma Prisma, ESLint, TypeScript | — | 10 min |
| Tests unitaires | Vitest, dont la synchronisation routes ↔ OpenAPI | Qualité | 10 min |
| Tests PostgreSQL | Migrations, seed et tests de transactions et de concurrence sur une base éphémère | Qualité | 15 min |
| Parcours navigateur | Playwright Chromium ; rapport conservé 7 jours en cas d’échec | Unitaires et PostgreSQL | 20 min |
| Compilation | `next build` de production | Qualité | 15 min |
| Documentation | Build Ladle, publié comme artefact `documentation-composants` | Qualité | 10 min |
| Image Docker | Build des cibles `migrator` et `runner`, démarrage limité à 1 CPU et 768 Mo, puis sonde `/api/health` | Qualité | 20 min |
| Lint, types, tests et compilation | Agrège les résultats ; échoue si un job n’a pas réussi | Tous | 2 min |

Le job agrégateur garde le nom **Lint, types, tests et compilation**, exigé par les rulesets de `main` et `dev` : renommer ce job bloquerait toutes les PR.

En local, `compose.yaml` applique la même logique de dépendances avec le profil `app` : `postgres` (sain) → `migrate` (terminé avec succès) → `app` (sonde `/api/health`), chaque service ayant des limites de CPU et de mémoire.

### Livraison et déploiement (CD)

`.github/workflows/cd.yml` démarre **après** la CI (`workflow_run`), uniquement si elle a réussi sur un push vers `main`. Il publie les images `ghcr.io/kuro250104/elite-pack` et `…-migrate`, étiquetées `sha-<commit>`, version et `latest`, avec le seul `GITHUB_TOKEN`. Si la variable `DEPLOY_ENABLED` vaut `true`, il déploie ensuite sur le serveur de production via l’environnement GitHub `production` : migrations, remplacement de l’application, sonde `/api/health`, retour arrière automatique. Procédure et configuration : [déploiement](deploiement.md).

### Historique

L’[exécution nº 37938740829](https://github.com/kuro250104/elite-pack/actions/runs/37938740829) a réussi sur `main` au commit `38c93b4` : **44 tests unitaires, 32 tests PostgreSQL et cinq parcours E2E**, ainsi que lint, typage et build.

PostgreSQL 17 est un service éphémère du job. Le secret Auth.js de test est généré pour l’exécution, masqué dans les logs et transmis par l’environnement. Aucune clé TheSportsDB ou OAuth de production n’est fournie aux PR. Les fournisseurs sont testés avec des fixtures. La CI possède `contents: read`, ne conserve pas les credentials Git et annule l’ancienne exécution d’une même branche. Le déploiement est séparé de la CI (voir ci-dessus).

Le job **Lint, types, tests et compilation** est obligatoire dans les rulesets de `main` et `dev`. `.github/workflows/branch-policy.yml` ajoute le contrôle **Origine de la PR vers main**, obligatoire sur `main` : il refuse toute PR vers `main` qui ne provient pas de `dev` ou d’une branche `hotfix/*`. Ces contrôles ne protègent les branches que parce que les rulesets distants les exigent.

## Triage des issues

`.github/workflows/issue-triage.yml` ajoute `status:backlog` aux nouvelles issues. Le champ Domaine des formulaires produit un label de la liste fermée `area:frontend`, `area:backend`, `area:transverse`. Le script traite le payload comme une donnée, sans interpolation dans une commande ni checkout de code utilisateur. Il crée les labels nécessaires s’ils sont absents et dispose de `issues: write`.

**Vingt exécutions distantes de triage ont réussi** lors de la création du backlog. Ce workflow ajoute des labels d’issue; les transitions du champ `Status` sont assurées par les workflows du Project. Modifier le domaine après ouverture nécessite de vérifier ou corriger le label.

Dependabot est configuré pour proposer les mises à jour npm et GitHub Actions chaque lundi à 08:00, heure de Paris, en PR vers `dev`. Les versions mineures et correctives npm sont regroupées; les majeures restent séparées. Les PR nécessitent CI et revue humaine. Aucune fusion automatique n’est configurée et aucune exécution Dependabot n’est revendiquée dans cette vérification.

## Workflows natifs Projects

Les huit règles suivantes sont **activées** dans le Project nº 4 :

| Règle | Action | Démonstration actuelle |
| --- | --- | --- |
| Ajout automatique depuis le dépôt | Ajouter les nouvelles issues ouvertes de `kuro250104/elite-pack` | Issue nº 24 ajoutée automatiquement, vérifié |
| Ajout automatique des sous-issues | Ajouter les enfants au projet | Activée ; hiérarchie des seize enfants présente |
| Élément ajouté | Status → Backlog | Issue nº 24 en Backlog, vérifié |
| Issue clôturée | Status → Done | Issue nº 24 clôturée puis en Done, vérifié |
| Issue rouverte | Status → Ready | Issue nº 24 rouverte puis en Ready, vérifié |
| PR liée | Status → Review | Vérifiée : PR nº 25 liée à l’issue nº 4, transition Ready → Review lue via l’API |
| PR fusionnée | Status → Done | Activée ; démonstration restant à effectuer |
| Status passé à Done | Clôturer l’issue | Activée ; démonstration restant à effectuer |

L’[issue de démonstration nº 24](https://github.com/kuro250104/elite-pack/issues/24) sert à vérifier le cycle de suivi. Son ajout automatique en Backlog et sa clôture vers Done ont été observés. La réouverture vers Ready a ensuite été confirmée par lecture de l’API. La démonstration est finalement clôturée ; sa trace est conservée.

Les quatre EPICs et seize enfants utilisent les relations natives parent/sous-issue. Le champ textuel EPIC parent d’un formulaire n’établit pas cette relation à lui seul. La reprise de l’importeur a réutilisé les vingt issues sans duplication.

## Vérifications restantes

Terminer, si exigées pour le rendu, les démonstrations des événements PR et de la clôture depuis Done. Inscrire les liens dans la feuille Google après identification de la ligne du groupe. Ces étapes ne sont pas considérées comme réalisées par les fichiers locaux.

## Sources

Sources officielles consultées le 9 octobre 2026 : [checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node), [github-script](https://github.com/actions/github-script), [automatisations Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations), [configuration Dependabot](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).
