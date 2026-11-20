# Droits des images d’athlètes

Un import réussi n’autorise jamais l’affichage de son image. Garder le visuel de remplacement jusqu’à validation documentée. Cette règle concerne aussi les captures de démonstration et le site public du POC.

## Vérifier chaque visuel

Les [conditions TheSportsDB](https://www.thesportsdb.com/docs_terms_of_use.php), actualisées le 17 septembre 2026 et consultées le 12 octobre 2026, précisent que `strCreativeCommons` est un indicateur, pas une licence. `Yes` exige encore la vérification du visuel exact, de sa source, de son créateur et de sa licence/version. `No`, une valeur inconnue ou absente ne permet aucune validation automatique. Les contenus aux droits inconnus doivent être exclus des publications publiques jusqu’à confirmation. Un abonnement API ne concède pas les droits des photographes, équipes ou marques.

Pour chaque image, conserver l’URL originale, la source, le créateur, la licence exacte avec sa version et son URL, l’attribution et les restrictions. Vérifier les conditions de modification, partage et usage commercial, ainsi que les droits de tiers. Une permission écrite peut compléter ce dossier. Les crédits doivent rester accessibles dans l’application.

## Application dans Elite Pack

L’import crée une référence non approuvée et préserve une image déjà enregistrée. Le drapeau Creative Commons ne suffit jamais à définir `approvedForDisplay=true`. Une validation administrative doit examiner la preuve et être auditée côté serveur. Les corrections ordinaires d’un athlète ne peuvent pas approuver une image.

La présence de métadonnées de licence n’établit pas automatiquement leur compatibilité avec l’usage prévu. En cas de doute, conserver le fallback ou sélectionner une image alternative dont les droits sont vérifiables. Ne pas télécharger ou exposer des visuels inconnus pour améliorer une démo.

La préparation de la configuration et de la commande d’import ne constitue ni une autorisation juridique ni une vérification de licence pour des images réelles. Les sources, crédits et autorisations doivent être renseignés image par image avant affichage.

## Workflow disponible

`/admin/images` permet une recherche et une pagination de 24 références par page. `PATCH /api/admin/images/:id` exige ADMIN, même origine, quota partagé et commande Zod stricte. Les commandes `set-metadata`, `approve` et `reject` portent une `expectedVersion` ; deux décisions simultanées ne peuvent pas s’écraser. Décision et audit sont atomiques.

Enregistrer des métadonnées retire toujours l’approbation précédente. Approuver exige confirmation explicite de la revue, motif, source, preuve HTTPS, attribution et couple licence/version + URL canonique. Sont acceptées CC0 1.0, CC BY et CC BY-SA en versions 2.0, 2.5, 3.0 et 4.0, uniquement dans leur version internationale (une version portée, par exemple `by-sa/3.0/de`, est refusée). Les licences NC (non commerciales) et ND (sans modification), le « domaine public » sans licence explicite et les permissions écrites restent non approuvables tant que leur politique n’est pas implémentée. Pour BY-SA, vérifier notamment les règles applicables aux adaptations ; ne pas ajouter de restrictions ou DRM contraires à la licence.

L’affichage passe par `displayableAthleteImage` : anciens enregistrements incomplets, références non approuvées ou révoquées renvoient le visuel de remplacement. Les crédits et liens source/licence accompagnent toute image validée. Les fichiers ne sont chargés qu’après validation, directement par le navigateur ; aucun proxy ou téléchargement serveur. Les hôtes image sont limités à `upload.wikimedia.org/wikipedia/commons/` et `www.thesportsdb.com/images/media/`, sans identifiants, paramètres, fragment ou port personnalisé.

La vérification syntaxique des liens de preuve ne fait aucun appel réseau. Un futur téléchargement de ces preuves devra contrôler DNS, redirections et type de contenu. La migration additive `20261012130000_image_review` impose des données de revue pour toute approbation en base ; elle ne devine pas les droits des images historiques.

## Portraits Wikimedia Commons et approbation automatique

Décision du 17 novembre 2026 : pour couvrir un catalogue de plusieurs centaines d’athlètes, les portraits Commons dont les droits sont vérifiables sans interprétation sont approuvés automatiquement. La commande est lancée par un administrateur réel, qui reste l’auteur de chaque décision dans le journal :

```sh
npm run images:commons -- --actor-id ID_ADMIN --confirm [--limit 500] [--sport ID_SPORT] [--no-approve]
```

- **Identité** : Wikidata n’a pas d’identifiant TheSportsDB. La recherche par nom (`wbsearchentities`) ne fournit que des candidats ; l’élément retenu doit être un humain (P31 = Q5) dont la date de naissance (P569, précision au jour) est exactement celle importée. Aucun candidat ou plusieurs candidats : l’athlète est laissé sans image. L’identifiant Wikidata confirmé est enregistré dans `AthleteExternalId`. Les athlètes sans date de naissance ne sont pas traités.
- **Image** : fichier de la propriété P18, métadonnées lues sur l’API Commons (`extmetadata` : `LicenseShortName`, `LicenseUrl`, `Artist`, `Restrictions`). Seuls les JPEG, PNG et WebP sont retenus. L’image affichée est la miniature standard de 500 px sur `upload.wikimedia.org` ; la page du fichier sert de source et de preuve.
- **Approbation automatique**, par le même service et avec le même audit (`IMAGE_APPROVE`) qu’une revue manuelle, seulement si : le nom et l’URL de licence désignent ensemble une licence acceptée ci-dessus, un auteur est indiqué, et Commons ne déclare aucune restriction autre que l’avertissement « personality ». Cet avertissement, présent sur la plupart des photos de personnes identifiables, rappelle l’existence des droits de la personnalité ; il ne restreint pas la licence et la question se pose de la même façon pour un portrait sans avertissement. Il est conservé dans les restrictions d’usage. Toute autre restriction (marque, insigne…) bloque l’approbation automatique. Le motif enregistré cite la licence, l’élément Wikidata et la date de naissance.
- **Sinon**, les métadonnées sont enregistrées sans approbation et l’image attend une revue manuelle dans `/admin/images`. `--no-approve` force ce mode pour tout le lot.
- **Jamais remplacées** : une image approuvée ou ayant fait l’objet d’une décision administrative (`reviewedById`). Une référence TheSportsDB non revue est remplacée par le portrait Commons.
- **Réseau** : API d’action Wikidata et Commons, sans le service SPARQL (limité à une requête par minute lors des essais du 17 novembre 2026). Requêtes séquentielles, une par seconde au plus, avec respect de `Retry-After` : les clients anonymes sont limités fortement, un lot de 500 athlètes prend de l’ordre de 45 minutes. Le nom de client envoyé est générique.
- **Affichage** : les cartes (collection, ouverture de booster, marché) et la fiche athlète affichent l’auteur, un lien vers la page source et un lien vers la licence.

Limites : l’appariement nom + date de naissance réduit fortement les erreurs d’identité sans les exclure ; un administrateur peut rejeter une image depuis `/admin/images`. Les droits de la personnalité et les marques visibles sur une photo libre ne sont pas évalués par la licence elle-même. La pertinence de cette approbation automatique pour un usage public reste à valider par l’équipe.
