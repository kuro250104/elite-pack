"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mutationRequest } from "./api";

export type ReviewableImage = {
  id: string; version: number; approvedForDisplay: boolean;
  url: string; originalUrl: string; source: string;
  license: string | null; licenseUrl: string | null; attribution: string | null;
  usageRestrictions: string | null; evidenceUrl: string | null;
  decisionReason: string | null; reviewedAt: string | null;
};

type Metadata = Pick<ReviewableImage, "url" | "originalUrl" | "source" | "license" | "licenseUrl" | "attribution" | "usageRestrictions" | "evidenceUrl">;
type Command = { action: "set-metadata"; expectedVersion: number; metadata: Metadata }
  | { action: "approve"; expectedVersion: number; rightsConfirmed: true; reason: string }
  | { action: "reject"; expectedVersion: number; reason: string };

const licenses = [
  { id: "CC0-1.0", name: "CC0 1.0 — domaine public", url: "https://creativecommons.org/publicdomain/zero/1.0/" },
  { id: "CC-BY-4.0", name: "CC BY 4.0 — attribution", url: "https://creativecommons.org/licenses/by/4.0/" },
  { id: "CC-BY-SA-4.0", name: "CC BY-SA 4.0 — attribution et partage à l’identique", url: "https://creativecommons.org/licenses/by-sa/4.0/" },
];

function safeLink(value: string | null): string | null {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url.href : null; }
  catch { return null; }
}

export function ImageReviewForm({ image }: { image: ReviewableImage }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [awaitingVersion, setAwaitingVersion] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const awaiting = awaitingVersion === image.version;
  async function submit(command: Command) {
    if (pending || awaiting) return;
    setPending(true); setMessage(""); setFailed(false);
    try {
      await mutationRequest(`/api/admin/images/${encodeURIComponent(image.id)}`, "PATCH", command);
      setAwaitingVersion(image.version);
      setMessage(command.action === "set-metadata" ? "Métadonnées enregistrées. La validation précédente est révoquée : vérifiez les droits avant une nouvelle approbation." : command.action === "approve" ? "Image approuvée pour l’affichage." : "Image refusée : son affichage est désactivé.");
      router.refresh();
    } catch (error) {
      setFailed(true); setMessage(error instanceof TypeError ? "Connexion interrompue. Actualisez les données avant de réessayer." : error instanceof Error ? error.message : "La décision n’a pas pu être enregistrée.");
    } finally { setPending(false); }
  }
  return <div className="min-w-0 space-y-5">
    <div className="space-y-2 text-sm">
      <p className="font-semibold">{image.approvedForDisplay ? "Affichage autorisé" : "Affichage non autorisé"}</p>
      <p className="text-muted-foreground">Aucun aperçu de l’image n’est chargé dans ce formulaire. Consultez sa source et sa preuve de licence pour examiner les droits.</p>
      {image.reviewedAt && <p className="text-muted-foreground">Dernière décision : {new Date(image.reviewedAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</p>}
      {image.decisionReason && <p className="[overflow-wrap:anywhere]">Motif précédent : {image.decisionReason}</p>}
      <div className="flex flex-wrap gap-4">
        {safeLink(image.originalUrl) && <a href={safeLink(image.originalUrl)!} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">Consulter la source (nouvel onglet)</a>}
        {safeLink(image.evidenceUrl) && <a href={safeLink(image.evidenceUrl)!} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">Consulter la preuve (nouvel onglet)</a>}
      </div>
    </div>
    <ReviewFields key={`${image.id}:${image.version}`} image={image} disabled={pending || awaiting} submit={submit} />
    <div aria-live="polite" aria-atomic="true">
      {message && <p role={failed ? "alert" : "status"} className={failed ? "text-sm text-destructive" : "text-sm text-primary"}>{message}</p>}
      {(pending || awaiting) && <p className="mt-2 text-sm text-muted-foreground">{pending ? "Enregistrement en cours…" : "Actualisation de la version en cours…"}</p>}
    </div>
    {(failed || awaiting) && <Button variant="outline" onClick={() => router.refresh()} disabled={pending}>Actualiser les données</Button>}
  </div>;
}

function ReviewFields({ image, disabled, submit }: { image: ReviewableImage; disabled: boolean; submit: (command: Command) => Promise<void> }) {
  const initial: Metadata = { url: image.url, originalUrl: image.originalUrl, source: image.source, license: image.license, licenseUrl: image.licenseUrl, attribution: image.attribution, usageRestrictions: image.usageRestrictions, evidenceUrl: image.evidenceUrl };
  const [metadata, setMetadata] = useState(initial);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const dirty = JSON.stringify(metadata) !== JSON.stringify(initial);
  const prefix = `image-${image.id}`;
  async function saveMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    await submit({ action: "set-metadata", expectedVersion: image.version, metadata });
  }
  async function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const action = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value;
    if (!reason.trim()) { setError("Indiquez le motif de votre décision."); return; }
    if (action === "approve") {
      if (dirty) { setError("Enregistrez les métadonnées avant d’approuver cette image."); return; }
      if (!rightsConfirmed) { setError("Confirmez la vérification des droits avant d’approuver l’image."); return; }
      await submit({ action: "approve", expectedVersion: image.version, rightsConfirmed: true, reason: reason.trim() });
    } else if (action === "reject") await submit({ action: "reject", expectedVersion: image.version, reason: reason.trim() });
  }
  return <div className="min-w-0 space-y-6">
    <form onSubmit={saveMetadata}>
      <fieldset disabled={disabled} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <legend className="mb-3 font-semibold">Source et droits de l’image</legend>
        {([
          ["url", "URL de l’image", "url", true], ["originalUrl", "URL de la source originale", "url", true],
          ["source", "Nom de la source", "text", true], ["evidenceUrl", "URL de la preuve des droits", "url", false],
          ["attribution", "Attribution à afficher", "text", false],
        ] as const).map(([field, label, type, required]) => <div key={field} className="min-w-0 space-y-2">
          <label htmlFor={`${prefix}-${field}`} className="text-sm">{label}</label>
          <Input id={`${prefix}-${field}`} type={type} required={required} value={metadata[field] ?? ""} maxLength={field === "source" ? 250 : field === "attribution" ? 2000 : 2048} onChange={event => setMetadata(current => ({ ...current, [field]: required ? event.target.value : event.target.value || null }))} />
        </div>)}
        <div className="min-w-0 space-y-2"><label htmlFor={`${prefix}-license`} className="text-sm">Licence compatible</label>
          <select id={`${prefix}-license`} value={metadata.license ?? ""} onChange={event => { const license = licenses.find(item => item.id === event.target.value); setMetadata(current => ({ ...current, license: license?.id ?? null, licenseUrl: license?.url ?? null })); }} className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="">Licence non renseignée</option>
            {metadata.license && !licenses.some(item => item.id === metadata.license) && <option value={metadata.license}>Licence actuelle à vérifier : {metadata.license}</option>}
            {licenses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
        <div className="min-w-0 space-y-2 sm:col-span-2"><label htmlFor={`${prefix}-licenseUrl`} className="text-sm">URL canonique de la licence</label><Input id={`${prefix}-licenseUrl`} type="url" value={metadata.licenseUrl ?? ""} readOnly aria-describedby={`${prefix}-license-help`} /><p id={`${prefix}-license-help`} className="text-xs text-muted-foreground">Sélectionner une licence renseigne son URL officielle Creative Commons. Une licence seule ne dispense pas de vérifier la provenance et les autres droits applicables.</p></div>
        <div className="min-w-0 space-y-2 sm:col-span-2"><label htmlFor={`${prefix}-restrictions`} className="text-sm">Restrictions d’utilisation</label><textarea id={`${prefix}-restrictions`} value={metadata.usageRestrictions ?? ""} onChange={event => setMetadata(current => ({ ...current, usageRestrictions: event.target.value || null }))} rows={3} maxLength={4000} className="w-full min-w-0 rounded-md border bg-background p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
        <p className="text-sm text-muted-foreground sm:col-span-2">Tout enregistrement des métadonnées révoque l’autorisation d’affichage précédente. Une nouvelle décision est ensuite nécessaire.</p>
        <Button type="submit" variant="outline" className="h-auto min-h-11 whitespace-normal py-2 sm:col-span-2">Enregistrer les métadonnées</Button>
      </fieldset>
    </form>
    <form onSubmit={decide}>
      <fieldset disabled={disabled} className="min-w-0 space-y-4">
        <legend className="mb-3 font-semibold">Décision sur l’affichage</legend>
        <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" checked={rightsConfirmed} onChange={event => setRightsConfirmed(event.target.checked)} className="mt-1 size-4 shrink-0 accent-primary" /><span>J’ai vérifié les droits de l’image, sa provenance, l’attribution et les restrictions. Ils permettent son utilisation dans ce jeu.</span></label>
        <div className="space-y-2"><label htmlFor={`${prefix}-reason`} className="text-sm">Motif de la décision (obligatoire)</label><textarea id={`${prefix}-reason`} required value={reason} onChange={event => setReason(event.target.value)} maxLength={4000} rows={3} className="w-full min-w-0 rounded-md border bg-background p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
        {dirty && <p className="text-sm text-muted-foreground">Métadonnées modifiées : enregistrez-les et attendez leur actualisation avant d’approuver.</p>}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" name="action" value="approve" disabled={dirty || !rightsConfirmed} className="h-auto min-h-11 whitespace-normal py-2">Approuver l’affichage</Button>
          <Button type="submit" name="action" value="reject" variant="destructive" className="h-auto min-h-11 whitespace-normal py-2">Refuser l’affichage</Button>
        </div>
      </fieldset>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </form>
  </div>;
}
