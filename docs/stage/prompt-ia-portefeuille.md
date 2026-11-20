# Prompt IA : réaliser l’US 5.3 (historique du portefeuille)

Seconde user story de ton stage, à faire **après** [SCRUM-88](prompt-ia-scrum-88.md), une fois sa PR ouverte. Le fonctionnement est le même : tu copies-colles le bloc ci-dessous dans ton assistant de code.

## Avant de lancer l’IA

1. **La PR de SCRUM-88 est ouverte.** Tu n’as pas besoin d’attendre sa fusion : cette US touche d’autres fichiers.
2. **Repère la clé Jira de cette US** (par exemple `SCRUM-112`) et remplace `SCRUM-CLE` **à la première ligne du bloc** par cette clé.
3. **Vérifie que Git utilise toujours ton propre compte** : `git config user.name`.
4. **Lance ton assistant** à la racine du dépôt, puis copie-colle **tout le bloc** en un seul message.

## Après

- **Relis le diff** et le résumé final ; tu dois pouvoir expliquer chaque fichier.
- **Complète ton carnet de passation** avec tes propres mots.
- **Demande la revue** de la PR à ton tuteur. Ne la fusionne pas toi-même.

---

## Bloc à copier-coller

```text
CLÉ JIRA DE CETTE US : SCRUM-CLE

Tu es le développeur chargé de cette user story du projet Elite Pack (jeu de cartes multisport, Next.js, Prisma, PostgreSQL). Tu travailles de façon autonome jusqu’à l’ouverture de la pull request, en suivant exactement les règles ci-dessous. Toutes tes réponses et tous les textes visibles par les joueurs sont en français. Si la clé Jira ci-dessus vaut encore « SCRUM-CLE », arrête-toi et demande-la.

=== 0. RÈGLES ABSOLUES ===
- Lis d’abord, en entier : AGENTS.md, CONTRIBUTING.md, GUIDELINES.md, docs/onboarding.md (sections 1, 6 et 7), docs/errors.md. Ils priment sur tes habitudes.
- Ce projet utilise une version de Next.js qui diffère de tes connaissances : avant d’écrire une page ou une route, consulte node_modules/next/dist/docs/.
- Cette US est en LECTURE SEULE : aucune écriture dans Wallet ni WalletTransaction, aucune migration, aucune modification de schema.prisma.
- Ne modifie aucune fonctionnalité sans rapport. N’ajoute aucune dépendance npm. Ne modifie pas CHANGELOG.md (mis à jour par le tuteur à la livraison).
- La logique métier va dans src/server/ ; les routes API restent fines ; aucun calcul métier dans les composants React.
- Ne modifie jamais la configuration Git. Pas de push --force, pas de fusion, pas de modification de dev ou de main.
- Ne désactive, ne saute et n’affaiblis aucun test ou contrôle. N’affirme jamais qu’un test passe sans l’avoir exécuté.

=== 1. PRÉPARATION ===
  git status                       (l’arbre doit être propre ; sinon arrête-toi et explique pourquoi)
  git switch dev
  git pull --ff-only
  git switch -c feat/<clé jira>-wallet-history      (exemple : feat/SCRUM-112-wallet-history)
  npm ci
  docker compose -p elite-pack-foundation up -d
  npm run db:deploy
  npm run db:seed
  npm run db:seed-demo
Dans docs/stage/carnet-SCRUM-88.md (ou crée docs/stage/carnet-<clé>.md à partir de docs/carnet-de-passation.md), ajoute une section pour cette US avec les réponses aux quatre questions (quel ticket et quels critères, où est la logique métier, ce qui peut casser, comment tester).

=== 2. LA USER STORY ===
En tant que joueur (persona Thomas pour les échanges, persona Inès pour les statistiques, docs/personas.md), je veux voir mon solde et l’historique de toutes les pièces gagnées et dépensées, afin de comprendre d’où vient mon argent et de suivre mes échanges.

Données existantes (prisma/schema.prisma, à lire) :
- Wallet (clé userId) : balance, lifetimeEarnings, lifetimeSpending, en BigInt.
- WalletTransaction : walletId (= userId), type, amount (BigInt signé), balanceAfter, referenceId, metadata, createdAt, idempotencyKey ; index (walletId, createdAt).
- Signification de referenceId selon le type : BANK_SALE → id de l’exemplaire (CardInstance) revendu ; MARKETPLACE_SALE et MARKETPLACE_PURCHASE → id de l’annonce (MarketplaceListing, dont le champ card mène à l’exemplaire) ; BOOSTER_PURCHASE → id du type de booster (BoosterType.nameFr) ; INITIAL_BALANCE, REWARD, ADMIN_ADJUSTMENT → pas de détail.

Contrat d’API :
- GET /api/me/wallet?page=&pageSize=&type= (joueur connecté) → 200 :
  { balance, lifetimeEarnings, lifetimeSpending, transactions: [{ id, type, label, detail, amount, balanceAfter, createdAt }], total, page, pageSize }
  Montants en chaînes décimales (jamais de nombre flottant, jamais de BigInt brut). page 1..10000 défaut 1 ; pageSize 1..50 défaut 20 ; type facultatif, l’une des valeurs de l’enum WalletTransactionType. Tri createdAt décroissant puis id décroissant.
- Libellés (label) : INITIAL_BALANCE « Solde de départ », REWARD « Récompense », BANK_SALE « Revente à la banque », MARKETPLACE_SALE « Vente sur le marché », MARKETPLACE_PURCHASE « Achat sur le marché », BOOSTER_PURCHASE « Achat de booster », ADMIN_ADJUSTMENT « Ajustement administrateur ».
- Détail (detail) : « <athlète> — <édition> » pour la banque et le marché, nom du booster pour un achat de booster, null sinon ou si la référence est introuvable.
- Erreurs : 400 INVALID_INPUT (paramètre invalide), 401 UNAUTHENTICATED, 429 RATE_LIMITED. Un joueur sans portefeuille (cas anormal) reçoit 404 WALLET_NOT_FOUND (code déjà existant).
- Jamais exposés : idempotencyKey, metadata, walletId, referenceId bruts.

Critères d’acceptation :
1. Depuis /profil, un lien « Voir mon portefeuille » ouvre /profil/portefeuille, qui affiche le solde, le total gagné et le total dépensé.
2. L’historique est trié du plus récent au plus ancien : libellé, détail, montant signé (+ en vert, − en rouge, avec le texte du signe et pas seulement la couleur), solde après, date et heure en fr-FR, fuseau Europe/Paris.
3. Une revente ou un échange sur le marché indique l’athlète et l’édition concernés.
4. Le filtre « Type » limite la liste ; la pagination conserve le filtre.
5. Un nouveau joueur ne voit que son solde de départ.
6. Un joueur ne voit jamais les transactions d’un autre : l’identifiant vient uniquement de la session.
7. Un visiteur non connecté reçoit 401 sur l’API et est redirigé vers la connexion sur la page.
8. Utilisable sur mobile et en 800x600, sans défilement horizontal.

=== 3. RÉALISATION, ÉTAPE PAR ÉTAPE (un commit par étape) ===

Étape A — Service : src/server/wallet/history.ts
- import "server-only" ; style de src/server/collection/service.ts (paramètre client: PrismaClient = db en dernier, pour les tests).
- Exporte walletHistoryQuerySchema (z.coerce pour page et pageSize, z.enum des types) et walletTransactionLabels (Record du type vers le libellé).
- getWalletHistory(actorId, input, client) : lit le Wallet (sinon WALLET_NOT_FOUND), la page de transactions et le total en parallèle, puis résout les détails PAR LOTS (une requête findMany par catégorie de référence : exemplaires, annonces, boosters ; jamais une requête par ligne). Convertis tous les BigInt en String.
- Commit : feat(economy): add wallet history service

Étape B — Route API : src/app/api/me/wallet/route.ts
- GET uniquement, sur le modèle exact de src/app/api/me/cards/route.ts : requireApiUser, await reserveGameRequest(actor.id), success(await getWalletHistory(actor.id, Object.fromEntries(new URL(request.url).searchParams))), failure(error).
- Documente l’opération dans src/server/api-docs/openapi.ts, dans la section « Économie », juste après POST /api/bank/sales (tag « Économie », access « player », query: walletHistoryQuerySchema) : le test tests/unit/openapi.test.ts échoue sinon.
- Commit : feat(economy): add GET /api/me/wallet

Étape C — Interface
- src/components/economy/wallet-transaction-row.tsx : présentation d’une ligne (libellé, détail, montant signé avec formatCoins de src/lib/currency.ts, solde après, date). Composant serveur sans état ; en liste empilée sur mobile, en tableau à partir de sm si tu préfères, sans défilement horizontal en 800x600.
- Page src/app/(game)/profil/portefeuille/page.tsx (Server Component) : joueur via requireUser() de src/lib/auth/authorization.ts, GameNav en tête (même structure que src/app/(game)/profil/page.tsx), trois indicateurs (solde, total gagné, total dépensé), formulaire GET avec un select « Type » (classe field-select, label associé), liste, pagination « Précédent / Suivant » qui conserve le filtre, état vide, lien retour vers /profil.
- Dans src/app/(game)/profil/page.tsx, ajoute uniquement le lien « Voir mon portefeuille » près du solde. Ne change rien d’autre.
- Story Ladle src/components/economy/wallet-transaction-row.stories.tsx : gain, dépense, solde de départ, détail absent.
- Commit : feat(economy): add wallet history page

=== 4. TESTS (obligatoires, tous exécutés) ===
- tests/integration/wallet-history.test.ts (modèle : tests/integration/collection.test.ts ; données créées pour le test puis supprimées, ou transaction annulée) : ordre décroissant ; pagination (total, page 2) ; filtre par type ; totaux du Wallet ; détails résolus pour une revente, une vente et un achat sur le marché et un achat de booster ; isolation entre deux joueurs ; aucun champ interne exposé (idempotencyKey, metadata, walletId) ; type inconnu → erreur de validation ; joueur sans portefeuille → WALLET_NOT_FOUND.
- tests/unit/wallet-api.test.ts (modèle : tests/unit/admin-api.test.ts, avec vi.mock de @/lib/auth, du service et de @/server/game/api) : 401 sans session ; 400 pour un pageSize invalide ; le service reçoit l’identifiant de la session.
- tests/e2e/wallet.spec.ts (modèles : tests/e2e/game-loop.spec.ts et tests/e2e/auth-session.ts ; crée tes propres données et nettoie-les) : profil → « Voir mon portefeuille » → solde de départ visible → filtre par type → état vide pour un type absent ; même page en 800x600 sans défilement horizontal (document.documentElement.scrollWidth <= window.innerWidth).
- Commit : test(economy): cover wallet history

=== 5. VÉRIFICATIONS AVANT LA PR ===
Exécute et fais passer, sans exception :
  npm run lint
  npm run typecheck
  npm test
  npm run build
  npm run ladle:build
Puis, avec la base locale (valeur de DATABASE_URL du fichier .env ; sous PowerShell : $env:TEST_DATABASE_URL = "…") :
  TEST_DATABASE_URL="<valeur de DATABASE_URL>" npm run test:integration
  TEST_DATABASE_URL="<valeur de DATABASE_URL>" npm run test:e2e
Si un test sans rapport avec cette US échoue déjà sur dev, ne le modifie pas : signale-le dans la PR.

=== 6. PULL REQUEST ===
- git push -u origin <ta branche>
- Ouvre la PR vers dev (gh pr create --base dev) avec le titre « [<clé jira>] Historique du portefeuille » et le corps de .github/pull_request_template.md rempli honnêtement (coche uniquement ce que tu as réellement exécuté ; indique « Aucune migration »).
- Ne fusionne pas la PR.

=== 7. RÉSUMÉ FINAL POUR LE STAGIAIRE ===
Termine par un résumé en français, simple, destiné à un stagiaire qui doit pouvoir l’expliquer à l’oral :
1. ce qui a été fait, fichier par fichier, en une phrase chacun ;
2. les réponses aux quatre questions du ticket ;
3. comment démontrer la fonctionnalité en 2 minutes dans le navigateur (par exemple : revendre une carte à la banque, puis la retrouver dans l’historique) ;
4. les commandes exécutées et leur résultat réel ;
5. les décisions prises et les limites éventuelles ;
6. le lien de la PR.
Recopie ce résumé, de façon concise, dans le carnet de passation, puis committe et pousse : docs(stage): update handover notebook.
```
