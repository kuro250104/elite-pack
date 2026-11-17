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
