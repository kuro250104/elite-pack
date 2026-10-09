# Tests PostgreSQL

Utiliser une base **de test** et appliquer d'abord les migrations. Exemple avec le PostgreSQL local fourni :

```sh
DATABASE_URL="$DATABASE_URL" npm run db:deploy
TEST_DATABASE_URL="$DATABASE_URL" npm run test:integration
```

`TEST_DATABASE_URL` est obligatoire : son absence produit une erreur explicite, aucun test n'est sauté. Chaque test utilise une connexion PostgreSQL, une transaction isolée et un `ROLLBACK` systématique. Aucun nettoyage global ni suppression de données partagées n'est exécuté.

Ces tests vérifient les contraintes réellement installées par la migration initiale. Ils ne prouvent pas encore les transactions métier ni la concurrence des futurs services de frappe et d'achat : ces scénarios seront ajoutés lors de leur implémentation.
