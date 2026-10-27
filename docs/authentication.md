# Connexion locale par e-mail et mot de passe

`/inscription` crée un joueur et `/connexion` accepte ses identifiants, sans compte ni clé GitHub. GitHub reste une option lorsque ses identifiants OAuth sont configurés. `AUTH_SECRET` est toujours nécessaire ; le générer avec `openssl rand -base64 32` et le conserver dans `.env` ignoré par Git.

## Création du compte

`POST /api/auth/register` valide un JSON strict de 64 Ko maximum, la même origine, le nom affiché, l’e-mail normalisé et les deux mots de passe identiques de 12 à 128 caractères. Un rôle envoyé par le navigateur est refusé. Le mot de passe n’est pas tronqué ni nettoyé : ses espaces et caractères Unicode sont conservés.

Le hachage scrypt utilise les paramètres fixes N=32768, r=8, p=3, un sel aléatoire de 16 octets et une empreinte de 64 octets. Cette configuration correspond à une option de l’[OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Node.js fournit directement l’algorithme ; aucune dépendance supplémentaire. La comparaison emploie `timingSafeEqual`. Un compte inconnu ou OAuth sans mot de passe effectue également le calcul cryptographique avant le refus.

Le calcul est effectué hors transaction, après réservation des quotas PostgreSQL. La création PLAYER, du portefeuille, du journal initial et du stock passif à zéro est atomique. Les nouveaux comptes comme les e-mails déjà enregistrés obtiennent la même réponse publique d’inscription ; aucun mot de passe d’un compte existant n’est remplacé. Cette politique ne constitue pas une preuve parfaite d’indistinguabilité temporelle.

## Sessions et autorisations

Le fournisseur [Credentials d’Auth.js](https://authjs.dev/getting-started/authentication/credentials) impose ici la stratégie JWT. Le cookie est HTTP-only, SameSite Lax et sécurisé sous HTTPS en production ; la durée maximale est de 24 heures. Auth.js contrôle les actions de connexion et de déconnexion et leurs jetons CSRF. Le callback JWT relit le compte et son rôle dans PostgreSQL à chaque requête ; les valeurs de rôle ou d’identifiant envoyées par une mise à jour de session cliente sont ignorées. Un compte supprimé invalide sa session.

La migration additive `20261012150000_credentials_auth` ajoute seulement `User.passwordHash`. Les comptes OAuth et lignes Session existants sont conservés. Les cookies issus de l’ancienne stratégie en base ne permettent plus une connexion : les utilisateurs concernés doivent se reconnecter. La déconnexion efface le cookie de l’appareil ; la révocation globale des sessions n’est pas implémentée dans cette phase.

Jamais de mot de passe ni de hash dans une réponse, session, log ou audit. Le JWT ne contient pas de hash. Les droits sensibles restent contrôlés à nouveau dans les services de domaine.

## Limites de tentatives

Les quotas partagés sont réservés avant le hachage : inscription 10/minute globalement et 3/heure par e-mail normalisé, connexion 60/minute globalement et 5/minute par e-mail. Les clés par e-mail utilisent SHA-256, pas l’adresse en clair. Ces limites prudentes conviennent au POC ; elles peuvent affecter les autres utilisateurs si le plafond global est atteint. Avant une exposition publique à grande échelle, compléter avec une limitation d’hébergement et une politique anti-abus adaptée.

## Accès administrateur local

L’inscription ne donne jamais ADMIN. Après avoir créé votre compte dans le site, un opérateur déjà administrateur peut attribuer ce rôle dans son terminal de confiance :

```sh
npm run admin:grant-local -- --actor-id ID_OPERATEUR_ADMIN --email EMAIL_DU_COMPTE_EXISTANT --confirm
```

La commande exige une base sur localhost, refuse le mode production, ne crée aucun compte et journalise le changement avec son acteur. L’opérateur technique créé pour les imports de ce POC est `local-import-operator`, sans mot de passe, compte OAuth ni session. Son identifiant seul ne permet aucune connexion au site. Aucun rôle administrateur n’a été attribué à un compte personnel automatiquement. Actualiser le site après l’attribution pour voir le lien Administration.

## À développer ensuite

La récupération du mot de passe, la vérification d’adresse et la révocation globale après changement de mot de passe ne sont pas encore implémentées. Les comptes OAuth existants ne reçoivent pas de mot de passe automatiquement. Le parcours navigateur vérifie inscription, mot de passe incorrect, connexion, refus d’injection de rôle, cookie HTTP-only, absence de hash, droits PLAYER et déconnexion effective.
