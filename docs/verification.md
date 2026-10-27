## Connexion locale — 12 octobre 2026

77 tests unitaires, 47 tests PostgreSQL et sept parcours Playwright réussis, lint et TypeScript strict réussis, build de production réussi. Inscription, mot de passe erroné, connexion réelle sans GitHub, cookie HTTP-only, mise à jour de session avec faux rôle ignorée et déconnexion effective ont été vérifiés. Les tests administratifs utilisent des JWT de test signés et relisent les rôles réels.

Migration additive `20261012150000_credentials_auth` appliquée localement, sans suppression des comptes ou sessions historiques. Scrypt natif, quotas partagés et création atomique du joueur vérifiés. Aucun compte personnel n’a été créé automatiquement ni promu administrateur. La vérification d’adresse et la récupération de mot de passe restent à développer. Voir [authentication.md](authentication.md).

La [CI des imports et images](https://github.com/kuro250104/elite-pack/actions/runs/38193421227) a également réussi sur `61d1b81` : 71 unités, 40 PostgreSQL, six parcours, lint/types/build. La CI de la connexion locale sera vérifiée séparément avant de la déclarer réussie.

## Imports réels et revue des images — 12 octobre 2026

71 tests unitaires, 40 tests PostgreSQL et six parcours Playwright exécutés avec succès, lint et TypeScript strict réussis, build de production réussi. Les parcours images utilisent une fixture synthétique interceptée : aucune photo externe non validée n’est chargée. L’absence de débordement mobile a été vérifiée et une capture a été inspectée.

Migration additive `20261012130000_image_review` appliquée localement, sans reset ; Prisma régénéré. Import réel de deux sports, de Mbappé et Hamilton avec la clé publique de développement ; rejouer le job de Mbappé renvoie `replay=true`. Métadonnées Commons de Hamilton enregistrées non approuvées. Aucun droit d’image réel n’est approuvé automatiquement.

Configuration locale `.env` créée, ignorée par Git, permissions 0600, secret Auth.js généré sans sortie des valeurs. Une clé personnelle reste nécessaire pour le mode de production. Le build bloque l’utilisation de la clé publique. La connexion OAuth réelle n’est pas configurée ; la demande de connexion locale par e-mail/mot de passe est traitée séparément.

# Vérifications du socle — 9 octobre 2026

## Publication et vérification distante

Le [dépôt public kuro250104/elite-pack](https://github.com/kuro250104/elite-pack) est publié sur `main` au commit `38c93b4`. L’[exécution GitHub Actions nº 37938740829](https://github.com/kuro250104/elite-pack/actions/runs/37938740829) a réussi sous Node.js 22 : lint, TypeScript strict, **44 tests unitaires, 32 tests PostgreSQL, cinq parcours Playwright et build Next.js**.

Le [Project public nº 4](https://github.com/users/kuro250104/projects/4) contient les quatre EPICs et seize enfants natifs, issues nº 1 à 20. Status comporte cinq valeurs ordonnées; Priority propose P1/P2/P3; Estimation totalise 81 points sur les enfants. Les vues EPICs/table, Kanban/board groupé par Status et trié par Priority, et backlog/table ont été configurées avec leurs filtres et champs visibles.

La reprise réelle de l’importeur a produit **0 issue créée, 20 réutilisées**. Les enums GraphQL des dispositions ont été corrigés vers `BOARD_LAYOUT` et `TABLE_LAYOUT` puis validés sur l’API réelle. Vingt exécutions Actions de triage ont réussi. Huit workflows natifs Projects sont activés. L’issue [nº 24](https://github.com/kuro250104/elite-pack/issues/24) a démontré l’ajout automatique en Backlog puis la clôture vers Done; la réouverture vers Ready a ensuite été confirmée par lecture de l’API. La démonstration est finalement clôturée ; sa trace est conservée.

Le contrôle des 121 fichiers distants a confirmé l’absence de `.env`, `node_modules`, `.next` et `.next-e2e`. L’historique publié contient un commit assaini, `38c93b4`.

Rulesets *Protection main*, *Protection dev* et *Protection des tags de version* actifs le 27 octobre 2026 (voir [workflow](workflow.md#branches-et-protections)) ; le refus d’une PR vers `main` hors `dev`/`hotfix/*` reste à démontrer. La feuille Google de rendu n’est pas éditée, faute de nom ou numéro de groupe permettant d’identifier sa ligne. Aucune conformité complète du rendu n’est revendiquée. Les preuves et limites sont détaillées dans [poc-preuves.md](poc-preuves.md) et [poc-conformite.md](poc-conformite.md).

## Imports administratifs et préparation du TD POC

Dernière vérification locale : lint, TypeScript strict et 44 tests unitaires réussis, dont sept tests de l’importeur GitHub Projects (mode aperçu sans réseau, reprise et relations parent/enfant).

Les vérifications de la phase imports ont également été exécutées : 32 tests sur PostgreSQL réel, cinq parcours Playwright Chromium (dont administration, autorisations et mobile) et compilation Next.js de production. La migration additive `20261009153000_import_security` a été appliquée ; le schéma et la base sont synchronisés. Aucun import réel d’athlètes n’a été lancé.

L’aperçu du backlog valide quatre EPICs, seize sous-tâches et 81 points. Les sept fichiers YAML GitHub ont été analysés. La CI distante sous Node.js 22 et le Project sont désormais vérifiés comme indiqué ci-dessus. La connexion OAuth complète de l’application reste à vérifier avec les identifiants du fournisseur; la connexion du plugin GitHub de Codex est distincte.

## Vérification initiale

Exécutées sur la base PostgreSQL 17 locale créée pour ce projet :

- ESLint et TypeScript strict.
- 10 tests unitaires (validation et fournisseur TheSportsDB).
- 17 tests PostgreSQL (contraintes et initialisation atomique du joueur), écritures annulées après chaque scénario.
- Playwright Chromium : accueil français, mobile, connexion, protection joueur/admin et page 404.
- Migration initiale appliquée ; seed exécuté deux fois ; diff schéma/base vide.
- Compilation Next.js de production.

La connexion OAuth complète n’a pas été exécutée : aucun identifiant GitHub n’a été fourni. Les parcours vérifient la page de connexion et le refus d’accès anonyme. Les règles de transactions métier et leur concurrence ne sont pas encore implémentées.

## Audit des dépendances

`npm audit` exécuté. Un override compatible de `mysql2` vers `^3.24.5` corrige ses alertes transitives. Huit alertes hautes subsistent dans les chaînes d’outils `eslint-config-next → fast-glob → micromatch → braces` et `prisma → @prisma/config → deepmerge-ts`. Les huit entrées correspondent à deux vulnérabilités sous-jacentes. Aucun correctif compatible de `braces` n’est publié dans le registre consulté. `deepmerge-ts` exige un changement majeur vers v8 ; il n’est pas forcé sans validation de Prisma.

Ces outils traitent la configuration et les fichiers de développement ; les services de jeu n’acceptent pas de données externes dans ces chemins. Leur présence doit rester suivie avant mise en production. Aucun `npm audit fix --force` ni rétrogradation majeure du socle n’a été effectué.

## Environnement

Les connexions PostgreSQL, le serveur de test et Turbopack nécessitent l’accès aux sockets locaux. Le sandbox initial a bloqué ces opérations (`EPERM`) ; elles ont ensuite été exécutées avec autorisation d’escalade. Le PostgreSQL local reste disponible via `docker compose -p elite-pack-foundation`. Pour l’arrêter sans effacer les données : `docker compose -p elite-pack-foundation stop`.
