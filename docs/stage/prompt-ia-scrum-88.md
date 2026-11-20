# Prompt IA : réaliser SCRUM-88 (liste de souhaits)

Ce document te permet de réaliser ta user story [SCRUM-88](https://lemeurvincent31.atlassian.net/browse/SCRUM-88) avec ton assistant de code en ligne de commande (Claude Code, Codex, Cursor…).

## Avant de lancer l’IA (10 minutes)

1. **Docker Desktop est démarré.**
2. **Git utilise ton propre compte** : `git config user.name` et `git config user.email` doivent afficher ton nom et ton e-mail, pas ceux du tuteur.
3. **Le fichier `.env` est rempli** : voir [l’onboarding](../onboarding.md#étape-2--configurer-lenvironnement).
4. **Tu es à la racine du dépôt**, dans le terminal de ton IDE.
5. **Lance ton assistant**, puis copie-colle **tout le bloc ci-dessous** en un seul message.

## Après (indispensable)

- **Relis le résumé final de l’IA** et le diff de la PR : tu dois pouvoir expliquer chaque fichier à ton tuteur.
- **Complète ton carnet de passation** (`docs/stage/carnet-SCRUM-88.md`, préparé par l’IA) avec tes propres mots.
- **Demande la revue** de la PR à ton tuteur. Ne la fusionne pas toi-même.
- **Enchaîne avec ta seconde user story** : [historique du portefeuille](prompt-ia-portefeuille.md).

---

## Bloc à copier-coller

```text
Tu es le développeur chargé de la user story SCRUM-88 du projet Elite Pack (jeu de cartes multisport, Next.js, Prisma, PostgreSQL). Tu travailles de façon autonome jusqu’à l’ouverture de la pull request, en suivant exactement les règles ci-dessous. Toutes tes réponses et tous les textes visibles par les joueurs sont en français.

=== 0. RÈGLES ABSOLUES ===
- Lis d’abord, en entier : AGENTS.md, CONTRIBUTING.md, GUIDELINES.md, docs/onboarding.md (sections 1, 6 et 7), docs/errors.md, docs/database.md. Ils priment sur tes habitudes.
- Ce projet utilise une version de Next.js qui diffère de tes connaissances : avant d’écrire une page ou une route, consulte la documentation installée dans node_modules/next/dist/docs/ (conventions des fichiers, params asynchrones).
- Ne modifie aucune fonctionnalité sans rapport avec SCRUM-88. N’ajoute aucune dépendance npm. Ne modifie pas CHANGELOG.md (mis à jour par le tuteur à la livraison).
- La logique métier va dans src/server/ ; les routes API restent fines (validation, droits, appel du service) ; aucun calcul métier dans les composants React.
- Ne modifie jamais la configuration Git (nom, e-mail). Pas de push --force, pas de fusion, pas de modification de dev ou de main.
- Ne désactive, ne saute et n’affaiblis aucun test, contrôle ou hook. Si quelque chose échoue, corrige la cause.
- N’affirme jamais qu’un test passe sans l’avoir exécuté.

=== 1. PRÉPARATION ===
Exécute, dans l’ordre, et vérifie que chaque commande réussit :
  git status                       (l’arbre doit être propre ; sinon arrête-toi et explique pourquoi)
  git switch dev
  git pull --ff-only
  git switch -c feat/SCRUM-88-wishlist
  npm ci
  docker compose -p elite-pack-foundation up -d
  npm run db:deploy
  npm run db:seed
  npm run db:seed-demo
Puis copie docs/carnet-de-passation.md vers docs/stage/carnet-SCRUM-88.md et remplis la section « Les quatre questions du ticket » (quel ticket et quels critères, où est la logique métier, ce qui peut casser, comment tester).

=== 2. LA USER STORY ===
En tant que collectionneur (persona Thomas, docs/personas.md), je veux ajouter à une liste de souhaits les éditions qui me manquent, afin de savoir lesquelles chercher dans les boosters et sur le marché.

Contrat d’API (toutes les routes exigent un joueur connecté) :
- GET    /api/me/wishlist?page=&pageSize=   → 200, liste paginée : editionId, athleteId, nom de l’athlète, sport (nom français), rareté, nom de l’édition, maxSupply, owned (le joueur possède au moins un exemplaire actif), activeListings (nombre d’annonces ACTIVE du marché pour cette édition, hors annonces du joueur), addedAt.
- POST   /api/me/wishlist  corps {"editionId": "…"} → 201 si ajouté, 200 si déjà présent (idempotent, aucun doublon).
- DELETE /api/me/wishlist/{editionId} → 200 avec {"removed": true}.
Erreurs (format de docs/errors.md, via ApiError) :
- 400 INVALID_INPUT (corps invalide), 401 UNAUTHENTICATED, 403 INVALID_ORIGIN (POST et DELETE sans en-tête Origin du site), 415 INVALID_CONTENT_TYPE, 429 RATE_LIMITED.
- 404 EDITION_NOT_FOUND « Cette édition est introuvable. » si l’édition n’existe pas ou n’est pas active.
- 404 WISHLIST_ITEM_NOT_FOUND « Cette édition n’est pas dans votre liste de souhaits. » au retrait d’un élément absent.
- 422 WISHLIST_FULL « Votre liste de souhaits est pleine (100 éditions au maximum). » au-delà de 100 éditions.

Critères d’acceptation :
1. Étant donné une édition que je ne possède pas, quand je clique « Ajouter à ma liste de souhaits » sur la fiche athlète, alors elle apparaît dans l’onglet « Liste de souhaits » de la collection.
2. Étant donné une édition déjà dans ma liste, quand je l’ajoute de nouveau (y compris deux requêtes simultanées), alors aucun doublon n’est créé.
3. Étant donné un élément de ma liste, quand je le retire, alors il disparaît de la liste.
4. Étant donné une édition de ma liste en vente sur le marché, quand j’ouvre ma liste, alors un lien « Disponible sur le marché (n) » mène au marché filtré sur cet athlète.
5. Étant donné un visiteur non connecté, quand il appelle l’API, alors il reçoit 401.
6. Étant donné un identifiant d’édition inexistant, quand je l’ajoute, alors je reçois 404 et un message en français.
7. Un joueur ne voit et ne modifie jamais la liste d’un autre joueur : l’identifiant du joueur vient uniquement de la session, jamais du corps de la requête.
8. Les pages restent utilisables sur mobile et en 800x600, sans défilement horizontal.

=== 3. RÉALISATION, ÉTAPE PAR ÉTAPE (un commit par étape) ===

Étape A — Modèle et migration
- prisma/schema.prisma : modèle WishlistItem (id cuid, userId, editionId, createdAt Timestamptz(3) par défaut now()), relations vers User et CardEdition avec onDelete: Cascade, @@unique([userId, editionId]), @@index([userId, createdAt]). Ajoute les relations inverses dans User et CardEdition.
- Crée la migration : npx prisma migrate dev --name wishlist
- Relis le SQL généré : uniquement CREATE TABLE, CREATE INDEX et clés étrangères. Aucune suppression ni modification de table existante.
- Commit : feat(collection): add wishlist model and migration

Étape B — Service métier : src/server/wishlist/service.ts
- import "server-only" en première ligne ; suis le style de src/server/collection/service.ts et src/server/marketplace/service.ts (paramètre client: PrismaClient = db en dernier, pour les tests).
- Exporte : wishlistQuerySchema (page 1..10000 défaut 1, pageSize 1..50 défaut 24, z.coerce), wishlistAddSchema (z.object({ editionId: z.string().trim().min(1).max(100) }).strict()), maxWishlistItems = 100.
- listWishlist(actorId, input, client) : pagination, tri par addedAt décroissant, sans requête N+1 (au plus 3 requêtes : la page, le total, puis les comptages d’annonces et de possession groupés).
- addToWishlist(actorId, input, client) → { item, created } : dans une transaction, verrou consultatif par joueur (SELECT pg_advisory_xact_lock(hashtextextended('wishlist:' || joueur, 0)), comme dans les autres services), vérification de l’édition (existe et active, sinon EDITION_NOT_FOUND), élément déjà présent → renvoyer l’existant avec created=false, sinon contrôle de la limite de 100 (WISHLIST_FULL), puis création.
- removeFromWishlist(actorId, editionId, client) : suppression de l’élément du joueur, ou WISHLIST_ITEM_NOT_FOUND.
- wishlistedEditionIds(actorId, editionIds, client) : ensemble des éditions de la liste parmi celles demandées (pour la fiche athlète).
- Commit : feat(collection): add wishlist service

Étape C — Routes API
- src/app/api/me/wishlist/route.ts (GET, POST) et src/app/api/me/wishlist/[editionId]/route.ts (DELETE). Modèles à suivre : src/app/api/me/cards/route.ts et src/app/api/marketplace/listings/route.ts.
- Utilise uniquement src/lib/api/http.ts : requireApiUser, assertSameOrigin (POST et DELETE), readJson(request, wishlistAddSchema), success(data, statut), failure(error). Quota : await reserveGameRequest(actor.id) pour GET, await reserveGameRequest(actor.id, true) pour POST et DELETE (src/server/game/api.ts).
- Les paramètres de route sont asynchrones : context: { params: Promise<{ editionId: string }> }.
- Documente les trois opérations dans src/server/api-docs/openapi.ts (tag « Collection », query: wishlistQuerySchema, body: wishlistAddSchema, successStatus 201 pour POST) : le test tests/unit/openapi.test.ts échoue sinon.
- Ajoute EDITION_NOT_FOUND, WISHLIST_ITEM_NOT_FOUND et WISHLIST_FULL au catalogue de docs/errors.md (section 3).
- Commit : feat(collection): add wishlist API

Étape D — Interface (composants du design system uniquement : src/components/ui, rarityPresentation de src/components/cards/athlete-card.tsx)
- src/components/collection/wishlist-button.tsx (client) : bouton « Ajouter à ma liste de souhaits » / « Retirer de ma liste de souhaits », aria-pressed, désactivé pendant la requête, message d’erreur via apiErrorMessage de src/lib/api/client-errors.ts dans un élément role="alert", puis router.refresh().
- src/app/(game)/athletes/[id]/page.tsx : affiche ce bouton sur chaque édition non possédée (edition.owned === 0), avec l’état fourni par wishlistedEditionIds. Ne change rien d’autre sur la page.
- src/components/collection/wishlist-card.tsx : rareté (nom français et couleur), athlète, édition, sport, badge « Possédée » si owned, lien « Disponible sur le marché (n) » vers /marche?query=<nom de l’athlète encodé>&rarity=<rareté> si activeListings > 0, et le bouton de retrait.
- Nouvelle page src/app/(game)/collection/souhaits/page.tsx (Server Component, même structure que src/app/(game)/collection/page.tsx, joueur obtenu par requireUser() de src/lib/auth/authorization.ts, GameNav en tête) : titre, grille responsive, pagination, état vide « Votre liste de souhaits est vide. Ajoutez des éditions depuis l’encyclopédie. » avec un lien vers /athletes.
- Dans src/app/(game)/collection/page.tsx, ajoute uniquement un troisième onglet « Liste de souhaits » vers /collection/souhaits, avec le même style que « Mes cartes » et « Cartes manquantes » ; reprends cette barre d’onglets sur la nouvelle page. Ne modifie pas collectionQuerySchema.
- Story Ladle src/components/collection/wishlist-card.stories.tsx (même forme que src/components/collection/collection.stories.tsx) : édition manquante, édition possédée, édition disponible sur le marché.
- Commit : feat(collection): add wishlist pages and components

=== 4. TESTS (obligatoires, tous exécutés) ===
- tests/integration/wishlist.test.ts (modèle : tests/integration/collection.test.ts ; données créées pour le test puis supprimées ou transaction annulée, la base locale est partagée) :
  ajout puis relecture ; ajout répété idempotent (created=false) ; deux ajouts simultanés de la même édition → une seule ligne (Promise.all) ; limite de 100 puis WISHLIST_FULL ; édition inconnue ou inactive → EDITION_NOT_FOUND ; retrait puis WISHLIST_ITEM_NOT_FOUND au second retrait ; isolation entre deux joueurs ; owned et activeListings exacts (annonce ACTIVE d’un autre joueur comptée, annonce du joueur et annonce SOLD non comptées).
- tests/unit/wishlist-api.test.ts (modèle : tests/unit/admin-api.test.ts, avec vi.mock de @/lib/auth et du service) : 401 sans session ; 403 sans Origin valide ; 415 sans JSON ; 400 corps invalide ; le service reçoit l’identifiant de la session et jamais une valeur du corps ; 201 puis 200 selon created.
- tests/e2e/wishlist.spec.ts (modèles : tests/e2e/game-loop.spec.ts et tests/e2e/auth-session.ts ; crée tes propres données et nettoie-les) : fiche athlète → ajout → la carte est dans /collection/souhaits → retrait → état vide ; même parcours en 800x600 sans défilement horizontal (document.documentElement.scrollWidth <= window.innerWidth).
- Commit : test(collection): cover wishlist service, API and journey

=== 5. VÉRIFICATIONS AVANT LA PR ===
Exécute et fais passer, sans exception :
  npm run lint
  npm run typecheck
  npm test
  npm run db:validate
  npm run build
  npm run ladle:build
Puis, avec la base locale (remplace la valeur par celle de DATABASE_URL du fichier .env) :
  TEST_DATABASE_URL="<valeur de DATABASE_URL>" npm run test:integration
  npx playwright install chromium
  TEST_DATABASE_URL="<valeur de DATABASE_URL>" npm run test:e2e
Sous PowerShell, définis la variable avec $env:TEST_DATABASE_URL = "…" avant les commandes.
Si un test qui ne concerne pas la liste de souhaits échoue déjà sur dev, ne le modifie pas : signale-le dans la PR.

=== 6. PULL REQUEST ===
- git push -u origin feat/SCRUM-88-wishlist
- Ouvre la PR vers dev (gh pr create --base dev) avec le titre « [SCRUM-88] Liste de souhaits de cartes » et le corps de .github/pull_request_template.md rempli honnêtement : coche uniquement ce que tu as réellement exécuté, liste la migration, et rappelle la clé Jira SCRUM-88.
- Ne fusionne pas la PR et ne demande pas d’approbation à la place de l’humain.

=== 7. RÉSUMÉ FINAL POUR LE STAGIAIRE ===
Termine par un résumé en français, simple, destiné à un stagiaire qui doit pouvoir l’expliquer à l’oral :
1. ce qui a été fait, fichier par fichier, en une phrase chacun ;
2. les réponses aux quatre questions du ticket ;
3. comment démontrer la fonctionnalité en 2 minutes dans le navigateur ;
4. les commandes exécutées et leur résultat réel ;
5. les décisions prises et les limites éventuelles ;
6. le lien de la PR.
Recopie aussi ce résumé, de façon concise, dans docs/stage/carnet-SCRUM-88.md (section « Pour reprendre ce travail »), puis committe et pousse : docs(stage): update handover notebook.
```
