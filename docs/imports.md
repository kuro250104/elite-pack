# Imports administratifs

La page `/admin/imports` est réservée aux administrateurs via Auth.js. Les listes sont rendues côté serveur et paginées indépendamment : historique (`jobsPage`), sports (`sportsPage`) et athlètes (`page`, filtre `query`), avec 24 résultats par page. Les athlètes sont présentés dans des cartes sur une colonne sur mobile et deux colonnes sur grand écran, avec un formulaire unique par identité. Les noms et identifiants longs se replient dans leur carte; seul le tableau d’historique défile horizontalement si nécessaire. Aucune image du fournisseur n’est affichée.

Les formulaires utilisent les API administratives : `POST /api/admin/imports` avec `{kind:"sports"}` ou `{kind:"athlete",externalId,targetAthleteId?}`; `PATCH /api/admin/sports/:id` avec `{nameFr,active}`. La clé TheSportsDB reste sur le serveur : seul un booléen indiquant sa présence est transmis au composant. En l’absence de clé, les imports sont désactivés.

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

L’enrichissement réseau Wikidata/Olympedia et la validation des licences d’images restent à développer. Les contrats d’import permettent déjà de lier un identifiant provenant d’une autre source à une personne existante, après vérification administrative.
