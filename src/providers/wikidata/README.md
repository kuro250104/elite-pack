# Wikidata

Implémentation : `src/providers/wikimedia/client.ts` (API d’action Wikidata et Commons, sans SPARQL).

- `searchPeople(nom)` : candidats par libellé ou alias, jamais considérés comme une identité confirmée.
- `getPeople(qids)` : nature (P31), date de naissance au jour près (P569) et image (P18), par lots de 50.
- `getCommonsFiles(fichiers)` : URL, taille, type, licence, auteur et restrictions déclarés sur Commons.

L’usage (portraits avec approbation automatique encadrée) est décrit dans `docs/images-rights.md`. Les corrections administrateur sont préservées et aucune image n’est affichée sans licence compatible.
