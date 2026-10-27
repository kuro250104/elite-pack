import Image from "next/image";
import { UserRound } from "lucide-react";
import type { AthleteImage } from "@/generated/prisma/client";
import { displayableAthleteImage } from "@/server/images/presentation";
export function AthletePortrait({name, image}: {name: string; image: AthleteImage | null}) {
  const approved = displayableAthleteImage(image);
  if (!approved) return <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border bg-secondary p-5 text-center text-muted-foreground" role="img" aria-label={`Portrait de ${name} indisponible : droits non validés`}><UserRound aria-hidden="true" className="size-12" /><span className="text-sm">Portrait indisponible — droits non validés</span></div>;
  return <figure className="space-y-2"><Image src={approved.url} alt={`Portrait de ${name}`} width={480} height={600} unoptimized className="max-h-80 w-full rounded-lg object-contain" /><figcaption className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{approved.attribution} · <a href={approved.originalUrl} rel="noopener noreferrer" target="_blank" className="underline">Source</a> · <a href={approved.licenseUrl} rel="noopener noreferrer" target="_blank" className="underline">{approved.license}</a></figcaption></figure>;
}
