# Automatisations et suivi du travail

Le [dépôt public](https://github.com/kuro250104/elite-pack) et le [Project nº 4](https://github.com/users/kuro250104/projects/4) sont publiés. La CI distante et les automatismes de suivi ont été exécutés ou activés comme indiqué ci-dessous. Activation et démonstration sont distinguées.

## Vérifications automatiques du code

`.github/workflows/ci.yml` s’exécute sur les PR, les push vers `main` et à la demande. Node.js 22 installe le lockfile avec `npm ci`. Les étapes couvrent génération et validation Prisma, ESLint, TypeScript, Vitest, migrations, seed, tests PostgreSQL, Playwright Chromium et compilation Next.js.

L’[exécution nº 37938740829](https://github.com/kuro250104/elite-pack/actions/runs/37938740829) a réussi sur `main` au commit `38c93b4` : **44 tests unitaires, 32 tests PostgreSQL et cinq parcours E2E**, ainsi que lint, typage et build.

PostgreSQL 17 est un service éphémère du job. Le secret Auth.js de test est généré pour l’exécution, masqué dans les logs et transmis par l’environnement. Aucune clé TheSportsDB ou OAuth de production n’est fournie aux PR. Les fournisseurs sont testés avec des fixtures. La CI possède `contents: read`, ne conserve pas les credentials Git et annule l’ancienne exécution d’une même branche. Aucun déploiement n’est automatique.

Le job à rendre obligatoire dans les règles de branche est **Lint, types, tests et compilation**. La protection de `main` et des tags `v*` n’est **pas configurée ni testée**; une CI réussie ne l’active pas.

## Triage des issues

`.github/workflows/issue-triage.yml` ajoute `status:backlog` aux nouvelles issues. Le champ Domaine des formulaires produit un label de la liste fermée `area:frontend`, `area:backend`, `area:transverse`. Le script traite le payload comme une donnée, sans interpolation dans une commande ni checkout de code utilisateur. Il crée les labels nécessaires s’ils sont absents et dispose de `issues: write`.

**Vingt exécutions distantes de triage ont réussi** lors de la création du backlog. Ce workflow ajoute des labels d’issue; les transitions du champ `Status` sont assurées par les workflows du Project. Modifier le domaine après ouverture nécessite de vérifier ou corriger le label.

Dependabot est configuré pour proposer les mises à jour npm et GitHub Actions chaque lundi à 08:00, heure de Paris. Les versions mineures et correctives npm sont regroupées; les majeures restent séparées. Les PR nécessitent CI et revue humaine. Aucune fusion automatique n’est configurée et aucune exécution Dependabot n’est revendiquée dans cette vérification.

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

Terminer, si exigées pour le rendu, les démonstrations des événements PR et de la clôture depuis Done. Configurer et tester les protections de branches/tags. Inscrire les liens dans la feuille Google après identification de la ligne du groupe. Ces étapes ne sont pas considérées comme réalisées par les fichiers locaux.

## Sources

Sources officielles consultées le 9 octobre 2026 : [checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node), [github-script](https://github.com/actions/github-script), [automatisations Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations), [configuration Dependabot](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).
