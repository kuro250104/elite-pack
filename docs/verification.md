## Imports réels et revue des images — 12 octobre 2026

71 tests unitaires, 40 tests PostgreSQL et six parcours Playwright exécutés avec succès, lint et TypeScript strict réussis, build de production réussi. Les parcours images utilisent une fixture synthétique interceptée : aucune photo externe non validée n’est chargée. L’absence de débordement mobile a été vérifiée et une capture a été inspectée.

Migration additive `20261012130000_image_review` appliquée localement, sans reset ; Prisma régénéré. Import réel de deux sports, de Mbappé et Hamilton avec la clé publique de développement ; rejouer le job de Mbappé renvoie `replay=true`. Métadonnées Commons de Hamilton enregistrées non approuvées. Aucun droit d’image réel n’est approuvé automatiquement.

Configuration locale `.env` créée, ignorée par Git, permissions 0600, secret Auth.js généré sans sortie des valeurs. Une clé personnelle reste nécessaire pour le mode de production. Le build bloque l’utilisation de la clé publique. La connexion OAuth réelle n’est pas configurée ; la demande de connexion locale par e-mail/mot de passe est traitée séparément.

# Vérifications du socle — 9 octobre 2026

## Imports administratifs et préparation du TD POC

Dernière vérification locale : lint, TypeScript strict et 44 tests unitaires réussis, dont sept tests de l’importeur GitHub Projects (mode aperçu sans réseau, reprise et relations parent/enfant).

Les vérifications de la phase imports ont également été exécutées : 32 tests sur PostgreSQL réel, cinq parcours Playwright Chromium (dont administration, autorisations et mobile) et compilation Next.js de production. La migration additive `20261009153000_import_security` a été appliquée ; le schéma et la base sont synchronisés. Aucun import réel d’athlètes n’a été lancé.

L’aperçu du backlog valide quatre EPICs, seize sous-tâches et 81 points. Les sept fichiers YAML GitHub ont été analysés. Les actions CI et le Project distant ne sont pas encore vérifiés sur GitHub : les fichiers locaux ne prouvent pas leur activation. La connexion OAuth complète et l’exécution CI sous Node 22 restent à vérifier.

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
