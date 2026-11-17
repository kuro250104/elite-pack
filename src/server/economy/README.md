# Domaine economy

Toutes les sommes sont des entiers (`BigInt` en base, chaînes dans les réponses JSON). Aucun montant n’est accepté depuis le client.

## Valeur des éditions (`valuation.ts`)

- `RarityValue` stocke la valeur de base de chaque rareté (migration `20261117100000_rarity_values` : 10, 25, 75, 200, 600, 2 000 pièces), modifiable en base.
- Valeur d’une édition = valeur de rareté × (100 + prestige effectif) / 100, arrondie vers le bas. Le prestige effectif est `prestigeOverride ?? prestigeScore`, borné à 0–100 : il double la valeur au plus.
- `CardEdition.baseValue` est recalculée avec le prestige de son sport (`recomputeSportPrestige`) et quand un administrateur modifie la surcharge de prestige d’un athlète.

## Revente à la banque (`bank.ts`, `POST /api/bank/sales`)

1. Verrou consultatif par joueur, puis verrou de ligne sur le portefeuille et sur l’exemplaire.
2. Rejeu : une clé `Idempotency-Key` déjà utilisée renvoie le résultat enregistré, sans second crédit ; utilisée pour une autre carte, elle est refusée.
3. L’exemplaire doit appartenir au joueur, ne pas être retiré et n’avoir aucune annonce active du marché.
4. Prix = valeur de base × `GameConfiguration.bankResaleBasisPoints` / 10 000 (60 % par défaut), arrondi vers le bas.
5. L’exemplaire est retiré (`ownerId` nul, `retiredAt`) : il n’est jamais refrappé et `mintedSupply` reste inchangé. La découverte (`CardDiscovery`) est conservée.
6. Le portefeuille est crédité et le journal enregistre `BANK_SALE`, dans la même transaction.

## Marché entre joueurs (`src/server/marketplace/service.ts`)

Routes : `GET /api/marketplace`, `POST /api/marketplace/listings`, `DELETE /api/marketplace/listings/:id`, `POST /api/marketplace/listings/:id/buy` (en-tête `Idempotency-Key`).

- **Mise en vente** : carte possédée et non retirée, prix entier de 1 à 1 000 000 000 pièces. L’index unique partiel `MarketplaceListing_one_active_per_card` garantit une seule annonce active par carte. Répéter la même demande renvoie l’annonce existante.
- **Retrait** : seulement par le vendeur. Un second retrait n’a aucun effet ; une annonce vendue ne peut plus être retirée.
- **Achat**, en une transaction : verrous dans l’ordre annonce → carte → joueurs (triés) → portefeuilles (triés), pour éviter tout interblocage. Sont refusés : sa propre annonce (également interdit par la contrainte `not_self_purchase`), une annonce inactive et un solde insuffisant (la contrainte `Wallet_nonnegative_check` reste le dernier rempart). Les écritures `MARKETPLACE_PURCHASE` (montant négatif) et `MARKETPLACE_SALE` sont enregistrées, la carte change de propriétaire (`acquisitionSource = MARKETPLACE`) et la découverte de l’acheteur est enregistrée. La clé d’idempotence est stockée sur l’annonce (`purchaseIdempotencyKey`, unique) : un rejeu renvoie le résultat sans second débit.
- Une carte en vente ne peut pas être revendue à la banque.

## Solde de départ

Migration `20261117110000_starting_balance` : nouveaux joueurs à 500 pièces (`GameConfiguration.startingBalance`). La configuration n’est mise à jour que si elle valait encore 0 ; les portefeuilles existants ne sont pas crédités.
