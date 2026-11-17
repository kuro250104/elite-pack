/** Single place for the virtual currency's display name. Balances are integers; never format floats here. */
export const currencyName = { singular: "pièce", plural: "pièces" };

export function formatCoins(amount: number | bigint) {
  const value = typeof amount === "bigint" ? amount : BigInt(Math.trunc(amount));
  const absolute = value < BigInt(0) ? -value : value;
  return `${value.toLocaleString("fr-FR")} ${absolute > BigInt(1) ? currencyName.plural : currencyName.singular}`;
}
