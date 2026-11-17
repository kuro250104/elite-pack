"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { rarityPresentation, type CardRarity } from "@/components/cards/athlete-card";
import { mutationRequest } from "./api";

const rarities: CardRarity[] = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"];
type RarityNumbers = Record<CardRarity, number>;
type Economy = { startingBalance: number; bankResaleBasisPoints: number; passiveIntervalSeconds: number; passiveMaxStock: number; rarityValues: RarityNumbers };

const integer = (value: string) => (/^\d+$/u.test(value.trim()) ? Number(value) : Number.NaN);
const coins = (value: number) => `${value.toLocaleString("fr-FR")} pièce${value > 1 ? "s" : ""}`;
// Same integer formulas as the server (valuation.ts); the preview is informational only.
const editionValue = (rarityValue: number, prestige: number) => Math.floor((rarityValue * (100 + prestige)) / 100);
const resale = (value: number, basisPoints: number) => Math.floor((value * basisPoints) / 10_000);

function useSubmit() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  async function run(action: () => Promise<unknown>, success: string) {
    setPending(true); setMessage(null);
    try { await action(); setMessage({ text: success, failed: false }); router.refresh(); }
    catch (error) { setMessage({ text: error instanceof TypeError ? "Connexion interrompue. Réessayez." : error instanceof Error ? error.message : "Enregistrement impossible.", failed: true }); }
    finally { setPending(false); }
  }
  return { pending, message, run };
}

function Feedback({ message }: { message: { text: string; failed: boolean } | null }) {
  return message ? <p role={message.failed ? "alert" : "status"} className={message.failed ? "text-sm text-destructive" : "text-sm text-primary"}>{message.text}</p> : null;
}

export function EconomyForm({ initial }: { initial: Economy }) {
  const [draft, setDraft] = useState({
    startingBalance: String(initial.startingBalance), resalePercent: String(initial.bankResaleBasisPoints / 100),
    intervalMinutes: String(initial.passiveIntervalSeconds / 60), maxStock: String(initial.passiveMaxStock),
    rarityValues: Object.fromEntries(rarities.map((rarity) => [rarity, String(initial.rarityValues[rarity])])) as Record<CardRarity, string>,
  });
  const { pending, message, run } = useSubmit();
  const resaleBasisPoints = Math.round(Number(draft.resalePercent.replace(",", ".")) * 100);
  const values = Object.fromEntries(rarities.map((rarity) => [rarity, integer(draft.rarityValues[rarity])])) as RarityNumbers;
  const warnings = [
    integer(draft.startingBalance) === 0 && "Avec un solde de départ nul, un nouveau joueur ne peut rien acheter sur le marché avant une revente.",
    resaleBasisPoints >= 10_000 && "Avec un rachat à 100 %, revendre à la banque rapporte autant que la valeur de la carte : le marché perd son intérêt.",
    rarities.some((rarity, index) => index > 0 && values[rarity] < values[rarities[index - 1]!]) && "Une rareté plus élevée vaut moins qu’une rareté inférieure.",
    integer(draft.maxStock) < initial.passiveMaxStock && "Les joueurs qui ont plus de boosters gratuits que le nouveau maximum seront ramenés à ce maximum : les boosters en trop seront perdus.",
    rarities.some((rarity) => values[rarity] !== initial.rarityValues[rarity]) && "Modifier une valeur de rareté recalcule la valeur de toutes les éditions.",
  ].filter((warning): warning is string => Boolean(warning));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const minutes = Number(draft.intervalMinutes.replace(",", "."));
    await run(() => mutationRequest("/api/admin/economy", "PATCH", {
      startingBalance: integer(draft.startingBalance), bankResaleBasisPoints: resaleBasisPoints,
      passiveIntervalSeconds: Math.round(minutes * 60), passiveMaxStock: integer(draft.maxStock), rarityValues: values,
    }), "Règles économiques enregistrées.");
  }
  const field = (id: string, label: string, value: string, onChange: (value: string) => void, hint?: string) =>
    <div className="space-y-1"><label htmlFor={id} className="text-sm font-medium">{label}</label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} inputMode="decimal" required aria-describedby={hint ? `${id}-hint` : undefined} />
      {hint && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}</div>;
  return <form onSubmit={submit} className="space-y-6" aria-label="Règles économiques">
    <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <legend className="sr-only">Réglages généraux</legend>
      {field("economy-start", "Solde de départ (pièces)", draft.startingBalance, (value) => setDraft({ ...draft, startingBalance: value }), "Pour les nouveaux joueurs uniquement.")}
      {field("economy-resale", "Rachat par la banque (%)", draft.resalePercent, (value) => setDraft({ ...draft, resalePercent: value }), "Part de la valeur de la carte.")}
      {field("economy-interval", "Booster gratuit toutes les (minutes)", draft.intervalMinutes, (value) => setDraft({ ...draft, intervalMinutes: value }))}
      {field("economy-stock", "Stock maximal de boosters gratuits", draft.maxStock, (value) => setDraft({ ...draft, maxStock: value }), "Entre 1 et 10.")}
    </fieldset>
    <fieldset disabled={pending} className="space-y-3">
      <legend className="text-sm font-semibold">Valeur de base par rareté (pièces)</legend>
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">{rarities.map((rarity) =>
        field(`economy-value-${rarity}`, rarityPresentation[rarity].name, draft.rarityValues[rarity],
          (value) => setDraft({ ...draft, rarityValues: { ...draft.rarityValues, [rarity]: value } })))}</div>
    </fieldset>
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[32rem] text-sm"><caption className="p-3 text-left text-sm font-semibold">Aperçu : valeur d’une édition et prix de rachat</caption>
        <thead><tr className="border-t text-left text-muted-foreground"><th scope="col" className="p-3 font-medium">Rareté</th><th scope="col" className="p-3 font-medium">Prestige 0</th><th scope="col" className="p-3 font-medium">Prestige 50</th><th scope="col" className="p-3 font-medium">Prestige 100</th></tr></thead>
        <tbody>{rarities.map((rarity) => <tr key={rarity} className="border-t"><th scope="row" className={`p-3 text-left font-medium ${rarityPresentation[rarity].className.split(" ")[0]}`}>{rarityPresentation[rarity].name}</th>
          {[0, 50, 100].map((prestige) => { const value = editionValue(values[rarity], prestige);
            return <td key={prestige} className="p-3">{Number.isNaN(value) ? "—" : <>{coins(value)}<span className="block text-xs text-muted-foreground">rachat {Number.isNaN(resaleBasisPoints) ? "—" : coins(resale(value, resaleBasisPoints))}</span></>}</td>; })}
        </tr>)}</tbody>
      </table>
    </div>
    {warnings.length > 0 && <ul aria-label="Avertissements" className="space-y-1 rounded-lg border border-rarity-legendary/50 p-3 text-sm">{warnings.map((warning) => <li key={warning}>⚠ {warning}</li>)}</ul>}
    <Button type="submit" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer les règles économiques"}</Button>
    <Feedback message={message} />
  </form>;
}

export function BoosterSettingsForm({ booster }: { booster: { id: string; nameFr: string; active: boolean; cardCount: number; weights: RarityNumbers } }) {
  const [cardCount, setCardCount] = useState(String(booster.cardCount));
  const [percents, setPercents] = useState(Object.fromEntries(rarities.map((rarity) => [rarity, String(booster.weights[rarity] / 100)])) as Record<CardRarity, string>);
  const { pending, message, run } = useSubmit();
  const weights = Object.fromEntries(rarities.map((rarity) => [rarity, Math.round(Number(percents[rarity].replace(",", ".")) * 100)])) as RarityNumbers;
  const total = rarities.reduce((sum, rarity) => sum + weights[rarity], 0);
  const valid = Number.isFinite(total) && total === 10_000;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending || !valid) return;
    await run(() => mutationRequest(`/api/admin/boosters/${encodeURIComponent(booster.id)}`, "PATCH", { cardCount: integer(cardCount), weights }), "Booster enregistré.");
  }
  return <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-5" aria-label={`Réglages du booster ${booster.nameFr}`}>
    <h3 className="font-semibold">{booster.nameFr}{!booster.active && <span className="ml-2 text-xs font-normal text-muted-foreground">(désactivé)</span>}</h3>
    <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-4 lg:grid-cols-7">
      <legend className="sr-only">Nombre de cartes et probabilités</legend>
      <div className="space-y-1"><label htmlFor={`cards-${booster.id}`} className="text-sm font-medium">Cartes</label><Input id={`cards-${booster.id}`} value={cardCount} onChange={(event) => setCardCount(event.target.value)} inputMode="numeric" required /></div>
      {rarities.map((rarity) => <div key={rarity} className="space-y-1"><label htmlFor={`weight-${booster.id}-${rarity}`} className={`text-sm font-medium ${rarityPresentation[rarity].className.split(" ")[0]}`}>{rarityPresentation[rarity].name} (%)</label>
        <Input id={`weight-${booster.id}-${rarity}`} value={percents[rarity]} onChange={(event) => setPercents({ ...percents, [rarity]: event.target.value })} inputMode="decimal" required /></div>)}
    </fieldset>
    <p className={valid ? "text-sm text-muted-foreground" : "text-sm text-destructive"} role={valid ? undefined : "alert"}>
      Total : {Number.isFinite(total) ? (total / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : "—"} %{valid ? "" : " — les probabilités doivent totaliser exactement 100 %."}</p>
    <Button type="submit" variant="outline" disabled={pending || !valid}>{pending ? "Enregistrement…" : "Enregistrer le booster"}</Button>
    <Feedback message={message} />
  </form>;
}
