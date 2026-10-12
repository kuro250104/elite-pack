"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const failureMessage = "Inscription impossible. Vérifiez les informations saisies ou réessayez plus tard.";

export function RegisterForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (locked.current) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const password = String(fields.get("password") ?? "");
    const passwordConfirmation = String(fields.get("passwordConfirmation") ?? "");
    if (password !== passwordConfirmation) { setError("Les mots de passe ne correspondent pas."); return; }
    locked.current = true; setPending(true); setError("");
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: String(fields.get("name") ?? "").trim(), email: String(fields.get("email") ?? "").trim(), password, passwordConfirmation }),
      });
      if (!response.ok) { setError(failureMessage); return; }
      form.reset();
      router.push("/connexion?registered=1");
    } catch { setError(failureMessage); }
    finally { locked.current = false; setPending(false); }
  }
  return <form onSubmit={submit} className="min-w-0 space-y-4" aria-describedby="registration-feedback">
    <fieldset disabled={pending} className="min-w-0 space-y-4">
      <legend className="sr-only">Inscription avec une adresse e-mail et un mot de passe</legend>
      <div className="space-y-2"><label htmlFor="register-name" className="text-sm font-medium">Nom affiché</label><Input id="register-name" name="name" autoComplete="nickname" minLength={2} maxLength={80} required /></div>
      <div className="space-y-2"><label htmlFor="register-email" className="text-sm font-medium">Adresse e-mail</label><Input id="register-email" name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} maxLength={254} required /></div>
      <div className="space-y-2"><label htmlFor="register-password" className="text-sm font-medium">Mot de passe</label><Input id="register-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required aria-describedby="password-help" /><p id="password-help" className="text-xs text-muted-foreground">Entre 12 et 128 caractères. Les espaces font partie de votre mot de passe.</p></div>
      <div className="space-y-2"><label htmlFor="register-confirmation" className="text-sm font-medium">Confirmer le mot de passe</label><Input id="register-confirmation" name="passwordConfirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></div>
      <Button type="submit" className="w-full">{pending ? "Création en cours…" : "Créer mon compte"}</Button>
    </fieldset>
    <div id="registration-feedback" aria-live="polite" aria-atomic="true">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {pending && <p role="status" className="text-sm text-muted-foreground">Création du compte…</p>}
    </div>
  </form>;
}
