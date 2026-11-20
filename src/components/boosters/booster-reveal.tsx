"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { AthleteCard, rarityPresentation, type CardRarity, type CardView } from "@/components/cards/athlete-card";

const rarityOrder: CardRarity[] = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"];
const glow: Record<CardRarity, string> = {
  COMMON: "var(--rarity-common)", UNCOMMON: "var(--rarity-uncommon)", RARE: "var(--rarity-rare)",
  EPIC: "var(--rarity-epic)", LEGENDARY: "var(--rarity-legendary)", MYTHIC: "var(--rarity-mythic)",
};
const isSpecial = (rarity: CardRarity) => rarityOrder.indexOf(rarity) >= rarityOrder.indexOf("EPIC");

type Phase = "sealed" | "tearing" | "revealing" | "done";

/**
 * Presentation only: the cards were drawn and minted by the server before this component receives them.
 * Like a real pack, the rarest card comes last. Every step is a button, so keyboard and screen readers work.
 */
export function BoosterReveal({ cards, sport, onClose }: { cards: CardView[]; sport: string; onClose: () => void }) {
  const reducedMotion = useReducedMotion();
  const ordered = useMemo(() => cards.map((card, index) => ({ card, index }))
    .sort((a, b) => rarityOrder.indexOf(a.card.rarity) - rarityOrder.indexOf(b.card.rarity) || a.index - b.index)
    .map(({ card }) => card), [cards]);
  const [phase, setPhase] = useState<Phase>("sealed");
  const [current, setCurrent] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const focusTarget = useRef<HTMLButtonElement>(null);
  const card = ordered[current];

  useEffect(() => { focusTarget.current?.focus(); }, [phase, current, flipped]);

  function tear() {
    if (reducedMotion) { setPhase("revealing"); return; }
    setPhase("tearing");
    window.setTimeout(() => setPhase("revealing"), 900);
  }
  function next() {
    if (!flipped) { setFlipped(true); return; }
    if (current + 1 >= ordered.length) { setPhase("done"); return; }
    setFlipped(false);
    setCurrent((value) => value + 1);
  }

  if (phase === "done" || !card) {
    return <section aria-labelledby="cards-title" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="cards-title" className="text-2xl font-semibold">Vos nouvelles cartes</h2>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/collection" className="text-sm text-primary underline underline-offset-4">Voir ma collection</Link>
          <Button ref={focusTarget} variant="outline" onClick={onClose}>Ouvrir un autre booster</Button>
        </div>
      </div>
      <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((item, index) => <motion.div key={item.instanceId} initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.25, delay: reducedMotion ? 0 : index * 0.06 }}><AthleteCard card={item} /></motion.div>)}
      </div>
    </section>;
  }

  return <section aria-label="Ouverture du booster" className="relative overflow-hidden rounded-2xl border bg-gradient-to-b from-secondary/60 to-background px-4 py-8 sm:px-8">
    {phase !== "revealing"
      ? <div className="flex flex-col items-center gap-6">
          <motion.button ref={focusTarget} type="button" onClick={tear} disabled={phase === "tearing"} aria-label={`Déchirer le booster ${sport}`}
            className="relative h-80 w-56 cursor-pointer rounded-2xl outline-none focus-visible:ring-4 focus-visible:ring-primary sm:h-96 sm:w-64"
            animate={reducedMotion || phase === "tearing" ? undefined : { rotate: [0, -1.5, 1.5, -1, 0], y: [0, -4, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 0.6 }}>
            {/* Top strip: flies off when the pack is torn. */}
            <motion.span aria-hidden="true" className="absolute inset-x-0 top-0 z-10 block h-14 rounded-t-2xl border border-primary/50 bg-primary/80"
              animate={phase === "tearing" ? { y: -160, x: 60, rotate: 28, opacity: 0 } : { y: 0, x: 0, rotate: 0, opacity: 1 }}
              transition={{ duration: 0.6, ease: "easeIn" }} />
            <motion.span aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-primary/60 bg-gradient-to-br from-primary/40 via-card to-primary/20 p-6 text-center shadow-2xl"
              animate={phase === "tearing" ? { scale: [1, 1.06, 0.9], opacity: [1, 1, 0] } : { scale: 1, opacity: 1 }}
              transition={{ duration: 0.9, times: [0, 0.4, 1] }}>
              <Sparkles className="size-10 text-primary" />
              <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Elite Pack</span>
              <span className="text-2xl font-bold [overflow-wrap:anywhere]">{sport}</span>
              <span className="text-sm text-muted-foreground">{ordered.length} cartes</span>
            </motion.span>
          </motion.button>
          <p className="text-sm text-muted-foreground" aria-live="polite">{phase === "tearing" ? "Ouverture…" : "Touchez le booster pour le déchirer."}</p>
        </div>
      : <div className="flex flex-col items-center gap-5">
          <p className="text-sm text-muted-foreground">Carte {current + 1} / {ordered.length}</p>
          <div className="relative h-[27rem] w-64 [perspective:1200px] sm:h-[30rem] sm:w-72">
            {/* Remaining face-down cards behind the current one. */}
            {ordered.slice(current + 1).map((item, index) => <span key={item.instanceId} aria-hidden="true"
              className="absolute inset-0 rounded-xl border-2 border-primary/30 bg-card"
              style={{ transform: `translate(${(index + 1) * 5}px, ${(index + 1) * 5}px)`, zIndex: -index - 1 }} />)}
            <AnimatePresence mode="popLayout">
              <motion.div key={card.instanceId} className="absolute inset-0"
                initial={reducedMotion ? { opacity: 0 } : { x: 0, y: 30, opacity: 0 }}
                animate={{ x: 0, y: 0, opacity: 1 }}
                exit={reducedMotion ? { opacity: 0 } : { x: -320, rotate: -12, opacity: 0 }}
                transition={{ duration: reducedMotion ? 0.01 : 0.35 }}>
                <motion.div className="relative size-full [transform-style:preserve-3d]"
                  animate={{ rotateY: flipped ? 180 : 0 }} transition={{ duration: reducedMotion ? 0 : 0.6, ease: "easeInOut" }}>
                  {/* Back: the only clickable face, so the card's credit links never sit inside a button. */}
                  <button ref={flipped ? undefined : focusTarget} type="button" onClick={next} disabled={flipped} tabIndex={flipped ? -1 : 0}
                    aria-label={`Retourner la carte ${current + 1} sur ${ordered.length}`}
                    className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-primary/60 bg-gradient-to-br from-primary/30 via-card to-primary/10 outline-none [backface-visibility:hidden] focus-visible:ring-4 focus-visible:ring-primary">
                    <Sparkles aria-hidden="true" className="size-12 text-primary" />
                    <span aria-hidden="true" className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Elite Pack</span>
                  </button>
                  {/* Front */}
                  <div aria-hidden={!flipped} className="absolute inset-0 overflow-hidden rounded-xl [backface-visibility:hidden] [transform:rotateY(180deg)]"
                    style={{ boxShadow: flipped ? `0 0 ${isSpecial(card.rarity) ? 48 : 18}px ${glow[card.rarity]}` : undefined }}>
                    <AthleteCard card={card} />
                  </div>
                </motion.div>
              </motion.div>
            </AnimatePresence>
            {/* Burst for epic and above, once the card faces up. */}
            {flipped && isSpecial(card.rarity) && !reducedMotion && <motion.span aria-hidden="true" key={`burst-${card.instanceId}`}
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{ zIndex: -1, background: `radial-gradient(circle, ${glow[card.rarity]} 0%, transparent 65%)` }}
              initial={{ scale: 0.4, opacity: 0.9 }} animate={{ scale: 2.4, opacity: 0 }} transition={{ duration: 1.1, ease: "easeOut" }} />}
          </div>
          <div aria-live="polite" className="min-h-6 text-center text-sm font-semibold">
            {flipped && <span style={{ color: glow[card.rarity] }}>{rarityPresentation[card.rarity].name} — {card.name}</span>}
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Button ref={flipped ? focusTarget : undefined} onClick={next} className="min-h-11">{!flipped ? "Retourner la carte" : current + 1 < ordered.length ? "Carte suivante" : "Voir toutes les cartes"}</Button>
            <Button variant="ghost" onClick={() => setPhase("done")} className="min-h-11">Tout révéler</Button>
          </div>
        </div>}
  </section>;
}
