import Link from "next/link";
import { requireAdmin } from "@/lib/auth/authorization";
import { db } from "@/lib/db/prisma";
import { ImageReviewForm } from "@/components/admin/image-review-form";
import { AthletePortrait } from "@/components/athletes/athlete-portrait";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export default async function ImagesPage({searchParams}: {searchParams: Promise<Record<string,string|string[]|undefined>>}) {
  await requireAdmin();
  const params = await searchParams;
  const pageValue = Number(params.page), page = Number.isInteger(pageValue) && pageValue > 0 ? Math.min(pageValue,10000) : 1;
  const query = typeof params.query === "string" ? params.query.trim().slice(0,100) : "";
  const where = query ? {athlete: {name: {contains: query, mode: "insensitive" as const}}} : {};
  const [images,count] = await Promise.all([
    db.athleteImage.findMany({where,include:{athlete:{include:{sport:true}}},take:24,skip:(page-1)*24,orderBy:[{approvedForDisplay:"asc"},{id:"asc"}]}),db.athleteImage.count({where}),
  ]);
  const href = (value:number) => `/admin/images?${new URLSearchParams({page:String(value),...(query?{query}:{})})}`;
  return <main id="contenu" className="mx-auto min-w-0 max-w-6xl space-y-8 px-5 py-12 sm:px-8">
    <header className="space-y-4"><nav aria-label="Administration" className="flex flex-wrap gap-4 text-sm text-primary"><Link href="/admin">Administration</Link><Link href="/admin/imports">Imports et catalogue</Link></nav><h1 className="text-3xl font-bold">Validation des droits des images</h1><p className="max-w-3xl text-muted-foreground">Vérifiez chaque fichier, son auteur, sa licence précise et les droits nécessaires au jeu. La mention Creative Commons du fournisseur ne vaut pas autorisation. Une image non approuvée n’est pas chargée.</p></header>
    <form className="flex flex-wrap items-end gap-3" action="/admin/images"><div className="min-w-48 flex-1 space-y-2"><label htmlFor="image-query">Rechercher un athlète</label><Input id="image-query" name="query" defaultValue={query} maxLength={100}/></div><Button type="submit" variant="outline">Rechercher</Button></form>
    <div className="grid items-start gap-6 lg:grid-cols-2">{images.map(image => <article key={image.id} id={`image-${image.id}`} className="min-w-0 space-y-5 rounded-xl border bg-card p-5"><h2 className="text-xl font-semibold [overflow-wrap:anywhere]">{image.athlete.name}</h2><p className="text-sm text-muted-foreground">{image.athlete.sport.nameFr}</p><AthletePortrait name={image.athlete.name} image={image}/><ImageReviewForm image={{id:image.id,version:image.version,approvedForDisplay:image.approvedForDisplay,url:image.url,originalUrl:image.originalUrl,source:image.source,license:image.license,licenseUrl:image.licenseUrl,attribution:image.attribution,usageRestrictions:image.usageRestrictions,evidenceUrl:image.evidenceUrl,decisionReason:image.decisionReason,reviewedAt:image.reviewedAt?.toISOString()??null}}/></article>)}</div>
    {!count && <p className="text-muted-foreground">Aucune référence d’image à examiner. Importez un athlète pour commencer.</p>}
    <nav aria-label="Pagination des images" className="flex flex-wrap gap-4 text-sm">{page>1&&<Link href={href(page-1)} className="text-primary">Page précédente</Link>}<span>Page {page.toLocaleString("fr-FR")} · {count.toLocaleString("fr-FR")} image{count>1?"s":""}</span>{page*24<count&&<Link href={href(page+1)} className="text-primary">Page suivante</Link>}</nav>
  </main>;
}
