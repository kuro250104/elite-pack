"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({reset}: {error: Error & {digest?: string}; reset: () => void}) {return <main id="contenu" className="mx-auto max-w-lg px-6 py-24"><h1 className="text-3xl font-bold">Une erreur est survenue</h1><p className="my-6 text-muted-foreground">Le service est temporairement indisponible. Vous pouvez réessayer.</p><Button onClick={reset}>Réessayer</Button></main>;}
