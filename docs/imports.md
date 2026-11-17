# Imports administratifs

La page `/admin/imports` est réservée aux administrateurs via Auth.js. Les listes sont rendues côté serveur et paginées indépendamment : historique (`jobsPage`), sports (`sportsPage`) et athlètes (`page`, filtre `query`), avec 24 résultats par page. Les athlètes sont présentés dans des cartes sur une colonne sur mobile et deux colonnes sur grand écran, avec un formulaire unique par identité. Les noms et identifiants longs se replient dans leur carte; seul le tableau d’historique défile horizontalement si nécessaire. Aucune image du fournisseur n’est affichée.

Les formulaires utilisent les API administratives : `POST /api/admin/imports` avec `{kind:"sports"}` ou `{kind:"athlete",externalId,targetAthleteId?}`; `PATCH /api/admin/sports/:id` avec `{nameFr,active}`. La clé TheSportsDB reste sur le serveur : seul un statut sans secret indiquant la validité de la configuration est transmis au composant. En l’absence de clé, les imports sont désactivés.

Chaque demande d’import reçoit un UUID dans l’en-tête `Idempotency-Key`. Après une interruption réseau ou une erreur HTTP, le même corps conserve le même UUID lors d’une nouvelle tentative. Une demande différente reçoit un nouvel UUID. Les succès métier et les jobs `FAILED` sont distingués : un job échoué affiche son message français et reste consultable dans l’historique. Un nouvel essai après un résultat métier terminé utilise une nouvelle clé.

## Vérifier une association

L’identifiant TheSportsDB est numérique. Le catalogue affiche également l’identifiant interne de chaque athlète. Le champ facultatif `targetAthleteId` permet d’associer explicitement le fournisseur à une identité déjà présente : l’administrateur doit vérifier la personne et son sport avant de le saisir. Une correspondance de nom seule ne suffit pas. La validation et les conflits d’identité sont contrôlés par le service serveur.

Les sports importés sont désactivés par défaut. Relire leur nom français et enregistrer leur activation ne crée aucune carte ni aucun booster. Les corrections administratives doivent rester préservées lors des réimports.

Chaque ligne du catalogue propose un formulaire de corrections : nom, date de naissance, nationalité, équipe, position, biographie, prestige imposé et activation. Les champs facultatifs vides effacent leur valeur; seuls les champs dont la valeur diffère de la valeur initiale sont envoyés et deviennent prioritaires lors des réimports. En l’absence de différence, aucun PATCH n’est envoyé. Modifier le nom ne verrouille donc pas les autres données importées. `PATCH /api/admin/athletes/:id` applique les contrôles serveur et journalise ces modifications. La recherche distante via `GET /api/admin/imports/search?query=...` affiche les identités candidates sans créer ni associer de données. Ses résultats ne sont pas exhaustifs. L’administrateur vérifie l’identité puis recopie l’identifiant dans le formulaire d’import ciblé; aucune image distante n’est affichée.

## API et protections

Les réponses utilisent `{data: ...}` ou `{error:{code,message}}`. Un import terminé ou échoué retourne son job dans `data`; vérifier `status` et `errorMessage`. Les erreurs avant création du job retournent un statut HTTP 4xx/5xx. Les mutations JSON nécessitent un en-tête `Origin` correspondant à `AUTH_URL` (ou à l’origine de la requête en développement). Elles sont limitées à 64 Ko, valident strictement les champs et n’acceptent jamais un rôle ou un acteur transmis par le client.

Les routes administratives réservent un quota partagé PostgreSQL de 60 requêtes/minute par administrateur. Chaque recherche ou import réserve aussi le quota TheSportsDB partagé de 30 requêtes/minute, avec au moins 2,1 secondes entre demandes. Un HTTP 429 du fournisseur bloque les autres instances pour au moins une minute. Les recherches ne sont pas mises en cache dans cette phase. Les imports récupèrent les données hors transaction, puis enregistrent les données et la réussite du job atomiquement.

Une clé d’idempotence déjà utilisée renvoie son job sans rappeler le fournisseur. Réutiliser la clé pour une autre commande renvoie un conflit. Un job resté `RUNNING` plus de deux minutes est marqué `FAILED` lors d’une nouvelle tentative avec la même clé; il faut ensuite une nouvelle opération pour le relancer. Le verrou du job empêche un ancien traitement de remplacer cet état par une réussite tardive. Il n’y a pas encore de worker ni d’import en masse.

Pour tester avec l’API gratuite, utiliser la clé publique indiquée par la [documentation TheSportsDB](https://www.thesportsdb.com/documentation) dans `THESPORTSDB_API_KEY`. Le catalogue gratuit et les résultats de recherche peuvent être tronqués; aucun résultat n’est considéré comme exhaustif. Aucun import réel automatique n’est effectué par les tests.

L’enrichissement réseau Wikidata/Olympedia reste à développer. La revue des droits d’images est disponible dans `/admin/images`. Les contrats d’import permettent déjà de lier un identifiant provenant d’une autre source à une personne existante, après vérification administrative.

## Configuration explicite et commande opérateur

Renseigner `THESPORTSDB_MODE=development` et la clé publique de test dans `THESPORTSDB_API_KEY` pour le POC local. La [documentation officielle](https://www.thesportsdb.com/documentation), vérifiée le 12 octobre 2026, indique actuellement **123** ; **3** est une ancienne clé publique et ne doit pas être présentée comme personnelle. Le code ne fournit aucune clé par défaut. Le mode `personal` exige une clé numérique personnelle ; les clés publiques connues sont refusées dans ce mode. En `NODE_ENV=production`, le mode de développement et les clés publiques sont bloqués avant toute requête réseau. Une clé personnelle n’établit pas à elle seule la validité d’un abonnement : le fournisseur reste l’autorité.

Le statut transmis à l’interface et aux diagnostics contient uniquement `configured` et `mode`. Les valeurs de clé ne sont jamais retournées. Conserver le quota partagé prudent de 30 requêtes/minute même avec une clé personnelle.

La commande opérateur utilise les mêmes services, vérifie le rôle ADMIN réel dans PostgreSQL et ne crée aucun compte privilégié. Exécuter depuis la racine, avec Node.js 22, les migrations appliquées et un administrateur existant :

```sh
# Diagnostic : configuration, rôle ADMIN, PostgreSQL et disponibilité du fournisseur.
# Réserve les quotas mais ne crée ni job d’import ni athlète.
node --conditions=react-server --import tsx scripts/imports/bootstrap.ts --check --actor-id ID_ADMIN

# Import du catalogue réellement retourné, sans l’interpréter comme exhaustif.
node --conditions=react-server --import tsx scripts/imports/bootstrap.ts --sports --actor-id ID_ADMIN --idempotency-key UUID

# Import ciblé ; le sport doit déjà avoir une correspondance en base.
node --conditions=react-server --import tsx scripts/imports/bootstrap.ts --athlete ID_THESPORTSDB --actor-id ID_ADMIN --idempotency-key UUID
```

Remplacer les paramètres par des identifiants réels. Utiliser `crypto.randomUUID()` pour générer chaque nouvelle clé, et conserver la même clé pour rejouer la même opération. Les fichiers `.env.local` puis `.env` sont lus ; les variables déjà définies dans le processus restent prioritaires. La condition `react-server` rend explicite l’exécution serveur de modules protégés par `server-only`. La commande imprime uniquement des statuts et identifiants techniques, jamais les biographies, les URLs d’images ou les clés.

Pour une preuve multisport minimale : importer les sports disponibles, vérifier leurs noms français, puis importer un athlète de chacun de deux sports réellement présents. Une réponse gratuite tronquée peut rendre nécessaire une clé personnelle ou une sélection différente. Aucun scraping ni endpoint par sport supposé. Les visuels restent soumis à [la procédure de droits](images-rights.md), indépendamment du succès de l’import.

## Essai réel du 12 octobre 2026

La base locale contient le catalogue gratuit retourné (Football et Sports automobiles), Kylian Mbappé (`34162098`) et Lewis Hamilton (`34157136`). Les trois imports sont `COMPLETED`, avec audit et identifiants fournisseurs. Le rejeu de l’import de Mbappé retourne le même job avec `replay=true`. Les sports restent désactivés jusqu’à revue administrative ; aucune édition ni aucun booster n’a été créé.

Un opérateur local sans compte OAuth ni session (`local-import-operator`) a été créé explicitement pour journaliser cet essai. La commande ne crée ni n’élève elle-même un administrateur. Les images restent non approuvées. Le [dossier Commons de Hamilton](image-review-example.md) est enregistré comme métadonnées à examiner. Aucune clé personnelle ni import exhaustif n’est revendiqué.

## Palmarès et prestige

L’import d’un athlète appelle ensuite `lookuphonours.php?id=` ([documentation officielle](https://www.thesportsdb.com/documentation), vérifiée le 17 novembre 2026). La réponse fournit notamment `idHonour`, `strHonour`, `strSeason` et `strTeam`. Elle est stockée dans `Athlete.achievements` sous la forme `{ title, year, team, honourId }`. Avec la clé gratuite, la documentation annonce au plus **5** titres par joueur (500 en premium). Ce second appel passe par le même quota partagé que les autres requêtes. S’il échoue, l’import aboutit quand même et le palmarès déjà stocké est conservé. Une correction administrative du champ `achievements` n’est jamais écrasée.

Le prestige (`prestigeScore`, de 0 à 100) est recalculé pour tout le sport concerné, dans la transaction de l’import :

- les points correspondent au nombre de titres distincts (titre et saison) ;
- le score est le rang centile de l’athlète **au sein de son sport** : aucun sport n’est comparé à un autre ;
- un athlète sans titre obtient 0, et des athlètes à égalité obtiennent le même score ;
- la surcharge administrateur (`prestigeOverride`) n’est jamais modifiée et reste prioritaire à l’affichage.

Comme la clé gratuite plafonne le palmarès à cinq titres, de nombreux athlètes très titrés finiront à égalité. Une clé premium élargit l’écart sans modification du code.

Pour recalculer tous les sports à partir des palmarès déjà stockés, sans appel réseau :

```sh
npm run prestige:recompute -- --actor-id ID_ADMIN --confirm
```

Chaque sport est recalculé dans sa propre transaction et journalisé (`PRESTIGE_RECOMPUTE`). Les athlètes importés avant cette version n’ont pas de palmarès : réimportez-les pour le récupérer.

## Synchronisation périodique

Les athlètes liés à TheSportsDB sont rafraîchis par lots, les moins récemment synchronisés d’abord (`AthleteExternalId.importedAt` sert de date de dernière synchronisation). Chaque athlète passe par l’import habituel : une `ImportJob` journalisée, palmarès compris, et les corrections administratives (`administratorOverrides`) ne sont jamais écrasées. Chaque champ réellement modifié (ancien club, poste…) est conservé dans l’audit `ATHLETE_IMPORT_UPDATED`, sous `after.changes`, avec ses valeurs avant et après. Chaque lot est résumé par une entrée `ATHLETE_SYNC`.

- **Quota** : un athlète coûte deux appels (fiche et palmarès), espacés de 2,1 s par le limiteur partagé. Un lot de 8 athlètes (valeur par défaut, 20 au plus) prend environ 40 secondes. Au premier refus du fournisseur (HTTP 429), le lot s’arrête pour laisser le quota se rétablir.
- **Fraîcheur** : par défaut, seuls les athlètes non synchronisés depuis 24 heures sont repris.
- **Déclenchement manuel** : page `/admin/synchronisation` (bouton « Synchroniser maintenant ») ou `npm run imports:sync -- --actor-id ID_ADMIN [--limit 8] [--older-than-hours 24]`.
- **Tâche planifiée** : `vercel.json` appelle `GET /api/cron/sync-athletes` chaque nuit à 4 h (UTC). Les comptes Vercel Hobby n’autorisent qu’une exécution par jour ; un plan payant permet un rythme plus soutenu. La route exige deux variables d’environnement, à définir dans le déploiement (jamais dans le dépôt) :
  - `CRON_SECRET` : au moins 16 caractères. Vercel l’envoie dans l’en-tête `Authorization: Bearer …`, comparé en temps constant ;
  - `SYNC_ACTOR_ID` : identifiant d’un compte administrateur, auteur des imports et des entrées du journal.

  Sans ces variables, la route répond 503. Un mauvais secret reçoit 401 sans lancer de lot. La réponse ne contient que des compteurs.
