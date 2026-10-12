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

Enregistrer des métadonnées retire toujours l’approbation précédente. Approuver exige confirmation explicite de la revue, motif, source, preuve HTTPS, attribution et couple licence/version + URL canonique. Cette première version accepte CC0 1.0, CC BY 4.0 et CC BY-SA 4.0. Les autres licences et permissions écrites restent non approuvables tant que leur politique n’est pas implémentée. Pour BY-SA, vérifier notamment les règles applicables aux adaptations ; ne pas ajouter de restrictions ou DRM contraires à la licence.

L’affichage passe par `displayableAthleteImage` : anciens enregistrements incomplets, références non approuvées ou révoquées renvoient le visuel de remplacement. Les crédits et liens source/licence accompagnent toute image validée. Les fichiers ne sont chargés qu’après validation, directement par le navigateur ; aucun proxy ou téléchargement serveur. Les hôtes image sont limités à `upload.wikimedia.org/wikipedia/commons/` et `www.thesportsdb.com/images/media/`, sans identifiants, paramètres, fragment ou port personnalisé.

La vérification syntaxique des liens de preuve ne fait aucun appel réseau. Un futur téléchargement de ces preuves devra contrôler DNS, redirections et type de contenu. La migration additive `20261012130000_image_review` impose des données de revue pour toute approbation en base ; elle ne devine pas les droits des images historiques.
