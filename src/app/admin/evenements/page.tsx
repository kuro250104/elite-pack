import Link from "next/link";
import { requireAdmin } from "@/lib/auth/authorization";
import { db } from "@/lib/db/prisma";
import { listAdminEvents } from "@/server/boosters/events";
import { rarityPresentation } from "@/components/cards/athlete-card";
import { EventForm } from "@/components/admin/event-forms";

export default async function EventsAdminPage() {
  await requireAdmin();
  const [events, sports, editions] = await Promise.all([listAdminEvents(),
    db.sport.findMany({ where: { active: true }, orderBy: { nameFr: "asc" }, select: { id: true, nameFr: true } }),
    db.cardEdition.findMany({ where: { active: true }, orderBy: [{ athlete: { name: "asc" } }, { rarity: "asc" }], take: 500,
      select: { id: true, name: true, rarity: true, athlete: { select: { name: true } } } })]);
  const sportOptions = sports.map((sport) => ({ id: sport.id, label: sport.nameFr }));
  const editionOptions = editions.map((edition) => ({ id: edition.id, label: `${edition.athlete.name} — ${edition.name} (${rarityPresentation[edition.rarity].name})` }));
  return <main id="contenu" className="mx-auto min-w-0 max-w-5xl space-y-10 px-5 py-12">
    <Link href="/admin" className="text-sm text-primary hover:underline">← Administration</Link>
    <header className="space-y-2"><h1 className="text-3xl font-bold">Boosters événementiels</h1>
      <p className="max-w-3xl text-muted-foreground">Un événement est un booster disponible entre deux dates, gratuit ou payant en pièces, avec une limite par joueur facultative. Il est créé désactivé : réglez ses probabilités dans <Link href="/admin/economie" className="text-primary underline">Règles économiques et boosters</Link>, puis activez-le.</p></header>
    <section aria-labelledby="create-title" className="space-y-3"><h2 id="create-title" className="text-xl font-semibold">Nouvel événement</h2>
      <EventForm sports={sportOptions} editions={editionOptions} /></section>
    <section aria-labelledby="list-title" className="space-y-4"><h2 id="list-title" className="text-xl font-semibold">Événements existants</h2>
      {events.length === 0 && <p className="text-sm text-muted-foreground">Aucun événement pour le moment.</p>}
      {events.map((event) => <div key={event.id} className="space-y-2">
        <p className="text-sm text-muted-foreground">{event.active ? "Actif" : "Désactivé"} · {event.sold.toLocaleString("fr-FR")} booster{event.sold > 1 ? "s" : ""} obtenu{event.sold > 1 ? "s" : ""} par les joueurs</p>
        <EventForm event={event} sports={sportOptions} editions={editionOptions} />
      </div>)}
    </section>
  </main>;
}
